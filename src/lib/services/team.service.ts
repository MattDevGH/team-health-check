/**
 * Team management service.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9, 1.10, 19.4
 */

import { ValidationError, ConflictError, NotFoundError } from '@/lib/errors';
import { addMemberSchema } from '@/lib/validation/schemas';
import type { MemberSummary, TeamRole } from '@/lib/contracts/member-summary';
import type { TeamRepository, TeamMemberRepository, TeamMemberRoleRepository, SlackIdentityLinkRepository, AuditLogRepository, SessionRepository } from '@/lib/repositories/types';
import type { Team } from '@/lib/repositories/entities';

import { assembleMemberSummary, buildMemberSummary } from './member-summary';

export interface TeamServiceDeps {
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
  slackIdentityLinkRepo?: SlackIdentityLinkRepository;
  auditLogRepo: AuditLogRepository;
  sessionRepo: SessionRepository;
}

export interface TeamService {
  create(name: string, description: string | undefined, creatorId: string): Promise<Team>;
  findById(teamId: string): Promise<Team | null>;
  update(
    teamId: string,
    data: Partial<Pick<Team, 'name' | 'description' | 'slackDeliveryStart' | 'slackDeliveryEnd'>>,
    actorId: string,
  ): Promise<Team>;
  addMember(
    teamId: string,
    name: string,
    email: string | undefined,
    actorId: string,
  ): Promise<MemberSummary>;
  removeMember(teamId: string, memberId: string, userId: string): Promise<void>;
  updateMemberRole(teamId: string, memberId: string, role: TeamRole, actorId: string): Promise<MemberSummary>;
  getMembers(teamId: string): Promise<MemberSummary[]>;
  listTeams(memberId: string): Promise<Team[]>;
  archive(teamId: string, userId: string): Promise<void>;
  unarchive(teamId: string, userId: string): Promise<void>;
}

/**
 * Factory function for creating the team service.
 * Accepts repository dependencies via injection.
 */
export function createTeamService(deps: TeamServiceDeps): TeamService {
  const { teamRepo, teamMemberRepo, teamMemberRoleRepo, slackIdentityLinkRepo, auditLogRepo, sessionRepo } = deps;

  async function create(name: string, description: string | undefined, creatorId: string): Promise<Team> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      throw new ValidationError([
        { field: 'name', message: 'Team name is required', code: 'REQUIRED' },
      ]);
    }

    return teamRepo.createWithCreator({
      team: {
        name: trimmedName,
        description: description ?? undefined,
      },
      creator: {
        id: creatorId,
        name: creatorId,
        role: 'delivery_manager',
      },
      audit: {
        changeType: 'team_created',
        previousValue: '',
        newValue: JSON.stringify({ name: trimmedName, description }),
        userId: creatorId,
      },
    });
  }

  async function addMember(
    teamId: string,
    name: string,
    email: string | undefined,
    actorId: string,
  ): Promise<MemberSummary> {
    const parsed = addMemberSchema.safeParse({ name, email });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      })));
    }

    const existing = await teamMemberRepo.findByTeamAndNameEmail(teamId, parsed.data.name, parsed.data.email);
    if (existing) {
      throw new ConflictError(
        `Member with name "${parsed.data.name}" and email "${parsed.data.email ?? ''}" already exists in this team`
      );
    }

    /**
     * A person belongs to exactly one team.
     *
     * The schema does not enforce this — `TeamMember` is unique on
     * `(teamId, name, email)` — but sign-in resolves an email to a single
     * member, so a second membership would let that person be signed into
     * whichever team the query happened to return.
     *
     * Rejected here, before anything is written, so the manager doing the
     * adding finds out immediately rather than the member discovering it weeks
     * later in the wrong dashboard. Members without an email are exempt: the
     * ambiguity is about sign-in, and they cannot sign in.
     */
    if (parsed.data.email) {
      const elsewhere = await teamMemberRepo.findAllByEmail(parsed.data.email);
      const otherTeam = elsewhere.find((member) => member.teamId !== teamId);

      if (otherTeam) {
        throw new ConflictError(
          `That email already belongs to a member of another team. A person can belong to only one team in this tool.`
        );
      }
    }

    const member = {
      id: crypto.randomUUID(),
      teamId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
    };
    const summary = buildMemberSummary(member, ['team_member'], null);
    await teamRepo.addMemberWithAudit({
      member: {
        id: member.id,
        teamId,
        name: member.name,
        email: parsed.data.email,
      },
      role: 'team_member',
      audit: {
        changeType: 'member_added',
        previousValue: '',
        newValue: JSON.stringify(summary),
        userId: actorId,
      },
    });
    return summary;
  }

  /** Requirements 1.6, 19.7: atomically protect the final manager, remove, and audit. */
  async function removeMember(teamId: string, memberId: string, userId: string): Promise<void> {
    const member = await teamMemberRepo.findById(memberId);
    if (!member || member.teamId !== teamId) {
      throw new NotFoundError('Team member not found in this team');
    }

    await teamMemberRoleRepo.removeMemberWithRoleProtection(memberId, teamId);
    await auditLogRepo.create({
      teamId,
      changeType: 'member_removed',
      previousValue: JSON.stringify({ name: member.name, email: member.email }),
      newValue: JSON.stringify({ name: member.name, removedBy: userId }),
      userId,
    });
  }

  /** Requirements 19.5-19.7: replace a member role with final-manager protection. */
  async function updateMemberRole(
    teamId: string,
    memberId: string,
    role: TeamRole,
    actorId: string,
  ): Promise<MemberSummary> {
    const member = await teamMemberRepo.findById(memberId);
    if (!member || member.teamId !== teamId) {
      throw new NotFoundError('Team member not found in this team');
    }

    const previous = await teamMemberRoleRepo.findByMemberAndTeam(memberId, teamId);
    await teamMemberRoleRepo.replace({ memberId, teamId, role });
    if (previous.length !== 1 || previous[0].role !== role) {
      await auditLogRepo.create({
        teamId,
        changeType: 'role_replaced',
        previousValue: JSON.stringify(previous.map((entry) => entry.role)),
        newValue: JSON.stringify([role]),
        userId: actorId,
      });
    }
    return assembleMemberSummary(member, teamMemberRoleRepo, slackIdentityLinkRepo);
  }

  /** Requirement 1.8: Archive a team — sets archived flag, force-closes open session, logs audit */
  async function archive(teamId: string, userId: string): Promise<void> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // 1. Set team.archived = true
    await teamRepo.update(teamId, { archived: true });

    // 2. Find open session for this team and close it if exists
    const openSession = await sessionRepo.findOpenByTeamId(teamId);
    if (openSession) {
      await sessionRepo.update(openSession.id, {
        status: 'closed',
        actualCloseAt: new Date(),
      });
    }

    // 3. Log audit entry
    await auditLogRepo.create({
      teamId,
      changeType: 'team_archived',
      previousValue: JSON.stringify({ archived: false }),
      newValue: JSON.stringify({ archived: true }),
      userId,
    });
  }

  /** Requirement 1.10: Unarchive a team — clears archived flag, restores functionality, logs audit */
  async function unarchive(teamId: string, userId: string): Promise<void> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // 1. Set team.archived = false
    await teamRepo.update(teamId, { archived: false });

    // 2. Log audit entry
    await auditLogRepo.create({
      teamId,
      changeType: 'team_unarchived',
      previousValue: JSON.stringify({ archived: true }),
      newValue: JSON.stringify({ archived: false }),
      userId,
    });
  }

  /** Requirements 1.7, 2.7: return the stable member-summary API contract. */
  async function getMembers(teamId: string): Promise<MemberSummary[]> {
    const members = await teamMemberRepo.findByTeamId(teamId);
    return Promise.all(members.map((member) =>
      assembleMemberSummary(member, teamMemberRoleRepo, slackIdentityLinkRepo)
    ));
  }

  /** Return only the team containing the authenticated member. */
  async function listTeams(memberId: string): Promise<Team[]> {
    const member = await teamMemberRepo.findById(memberId);
    if (!member) return [];

    const team = await teamRepo.findById(member.teamId);
    return team ? [team] : [];
  }

  /** Find a team by ID */
  async function findById(teamId: string): Promise<Team | null> {
    return teamRepo.findById(teamId);
  }

  /** Update team details and audit valid Slack delivery-window changes. */
  async function update(
    teamId: string,
    data: Partial<Pick<Team, 'name' | 'description' | 'slackDeliveryStart' | 'slackDeliveryEnd'>>,
    actorId: string,
  ): Promise<Team> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const updateData: Partial<
      Pick<Team, 'name' | 'description' | 'slackDeliveryStart' | 'slackDeliveryEnd'>
    > = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;

    const updatesDeliveryWindow =
      data.slackDeliveryStart !== undefined || data.slackDeliveryEnd !== undefined;
    const previousWindow = {
      slackDeliveryStart: team.slackDeliveryStart,
      slackDeliveryEnd: team.slackDeliveryEnd,
    };
    const nextWindow = {
      slackDeliveryStart:
        data.slackDeliveryStart !== undefined
          ? data.slackDeliveryStart
          : team.slackDeliveryStart,
      slackDeliveryEnd:
        data.slackDeliveryEnd !== undefined ? data.slackDeliveryEnd : team.slackDeliveryEnd,
    };

    if (
      updatesDeliveryWindow &&
      (nextWindow.slackDeliveryStart === null) !== (nextWindow.slackDeliveryEnd === null)
    ) {
      throw new ValidationError([
        {
          field: 'slackDeliveryWindow',
          message: 'Slack delivery start and end must both be configured or both be cleared',
          code: 'custom',
        },
      ]);
    }

    if (updatesDeliveryWindow) {
      updateData.slackDeliveryStart = nextWindow.slackDeliveryStart;
      updateData.slackDeliveryEnd = nextWindow.slackDeliveryEnd;
    }

    const updatedTeam = await teamRepo.update(teamId, updateData);
    const deliveryWindowChanged =
      previousWindow.slackDeliveryStart !== nextWindow.slackDeliveryStart ||
      previousWindow.slackDeliveryEnd !== nextWindow.slackDeliveryEnd;

    if (updatesDeliveryWindow && deliveryWindowChanged) {
      await auditLogRepo.create({
        teamId,
        changeType: 'delivery_window_change',
        previousValue: JSON.stringify(previousWindow),
        newValue: JSON.stringify(nextWindow),
        userId: actorId,
      });
    }

    return updatedTeam;
  }

  return {
    create,
    findById,
    update,
    addMember,
    removeMember,
    updateMemberRole,
    getMembers,
    listTeams,
    archive,
    unarchive,
  };
}
