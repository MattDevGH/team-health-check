import { AppError, ConflictError, NotFoundError } from '../../errors';
import type { Team } from '../entities';
import type {
  AddTeamMemberWithAuditData,
  CreateFromGenesisParams,
  CreateTeamWithCreatorData,
  TeamRepository,
} from '../types';
import type { InMemoryAuditLogRepository } from './audit-log.repository';
import type { InMemoryTeamMemberRepository } from './team-member.repository';
import type { InMemoryTeamMemberRoleRepository } from './team-member-role.repository';

interface TeamCreationDeps {
  teamMember: InMemoryTeamMemberRepository;
  teamMemberRole: InMemoryTeamMemberRoleRepository;
  auditLog: InMemoryAuditLogRepository;
  /** Genesis also claims a token and opens a session (Requirement 7.9). */
  pendingGenesis?: {
    claimToken(token: string): Promise<{ email: string } | null>;
  };
  userSession?: {
    create(data: { memberId: string; token: string; expiresAt: Date }): Promise<unknown>;
  };
}

export class InMemoryTeamRepository implements TeamRepository {
  private readonly store = new Map<string, Team>();
  private readonly creatorClaims = new Set<string>();

  constructor(private readonly creationDeps?: TeamCreationDeps) {}

  async create(data: {
    name: string;
    description?: string;
    privacyMode?: string;
    timezone?: string;
  }): Promise<Team> {
    const now = new Date();
    const team: Team = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description ?? null,
      privacyMode: data.privacyMode ?? 'anonymous',
      archived: false,
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
      timezone: data.timezone ?? 'Europe/London',
      preSessionRecipient: 'delivery_manager',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(team.id, team);
    return team;
  }

  /**
   * Requirements: NFR 3.5, NFR 3.6; 7.9
   *
   * Not atomic here — there is nothing to roll back, and in particular a
   * token this claims stays claimed if a later step throws. That asymmetry is
   * exactly why NFR 3.7 asks for the property to be shown against a real
   * database; `atomic-writes.test.ts` does it.
   */
  async createFromGenesis(params: CreateFromGenesisParams): Promise<{ team: Team } | null> {
    const deps = this.creationDeps;
    if (!deps?.pendingGenesis || !deps.userSession) {
      throw new ConflictError('Atomic genesis is not configured');
    }

    const claimed = await deps.pendingGenesis.claimToken(params.token);
    if (!claimed) return null;

    const team = await this.persistClaimedAggregate(
      {
        team: params.team,
        creator: {
          id: params.memberId,
          name: params.memberName,
          email: params.email,
          role: 'delivery_manager',
        },
        audit: params.audit,
      },
      deps,
    );

    await deps.userSession.create({
      memberId: params.memberId,
      token: params.session.token,
      expiresAt: params.session.expiresAt,
    });

    return { team };
  }

  createWithCreator(data: CreateTeamWithCreatorData): Promise<Team> {
    const deps = this.creationDeps;
    if (!deps) {
      return Promise.reject(new ConflictError('Atomic team creation is not configured'));
    }
    if (this.creatorClaims.has(data.creator.id) || deps.teamMember.has(data.creator.id)) {
      return Promise.reject(new ConflictError('Team member already belongs to a team'));
    }

    this.creatorClaims.add(data.creator.id);
    return this.persistClaimedAggregate(data, deps);
  }

  async addMemberWithAudit(data: AddTeamMemberWithAuditData): Promise<void> {
    const deps = this.creationDeps;
    if (!deps) {
      throw new AppError(
        'Atomic member addition is not configured',
        'INTERNAL_ERROR',
        500,
      );
    }
    if (!this.store.has(data.member.teamId)) {
      throw new NotFoundError('Team not found');
    }

    let memberCreated = false;
    let roleCreated = false;
    let auditId: string | undefined;
    try {
      const member = await deps.teamMember.create(data.member);
      memberCreated = true;
      await deps.teamMemberRole.assign({
        memberId: member.id,
        teamId: member.teamId,
        role: data.role,
      });
      roleCreated = true;
      const audit = await deps.auditLog.create({
        teamId: member.teamId,
        ...data.audit,
      });
      auditId = audit.id;
      return;
    } catch (error: unknown) {
      if (auditId) deps.auditLog.remove(auditId);
      if (roleCreated) {
        await deps.teamMemberRole.remove(
          data.member.id,
          data.member.teamId,
          data.role,
        );
      }
      if (memberCreated) await deps.teamMember.remove(data.member.id);
      throw error;
    }
  }

  async findById(id: string): Promise<Team | null> {
    return this.store.get(id) ?? null;
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Team,
        | 'name'
        | 'description'
        | 'privacyMode'
        | 'archived'
        | 'slackDeliveryStart'
        | 'slackDeliveryEnd'
        | 'timezone'
        | 'preSessionRecipient'
      >
    >,
  ): Promise<Team> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundError(`Team not found: ${id}`);
    }
    const updated: Team = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async list(): Promise<Team[]> {
    return Array.from(this.store.values());
  }

  private async persistClaimedAggregate(
    data: CreateTeamWithCreatorData,
    deps: TeamCreationDeps,
  ): Promise<Team> {
    let team: Team | undefined;
    let memberCreated = false;
    let roleCreated = false;
    let auditId: string | undefined;

    try {
      team = await this.create(data.team);
      await deps.teamMember.create({
        id: data.creator.id,
        teamId: team.id,
        name: data.creator.name,
        email: data.creator.email,
      });
      memberCreated = true;
      await deps.teamMemberRole.assign({
        memberId: data.creator.id,
        teamId: team.id,
        role: data.creator.role,
      });
      roleCreated = true;
      const audit = await deps.auditLog.create({ teamId: team.id, ...data.audit });
      auditId = audit.id;
      return team;
    } catch (error: unknown) {
      if (auditId) deps.auditLog.remove(auditId);
      if (roleCreated && team) {
        await deps.teamMemberRole.remove(data.creator.id, team.id, data.creator.role);
      }
      if (memberCreated) await deps.teamMember.remove(data.creator.id);
      if (team) this.store.delete(team.id);
      throw error;
    } finally {
      this.creatorClaims.delete(data.creator.id);
    }
  }
}
