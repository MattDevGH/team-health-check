/**
 * Team management service.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9, 1.10, 19.4
 */

import { ValidationError, ConflictError, NotFoundError } from '@/lib/errors';
import { addMemberSchema } from '@/lib/validation/schemas';
import type { TeamRepository, TeamMemberRepository, TeamMemberRoleRepository, AuditLogRepository, SessionRepository } from '@/lib/repositories/types';
import type { Team, TeamMember } from '@/lib/repositories/entities';

export interface TeamServiceDeps {
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
  auditLogRepo: AuditLogRepository;
  sessionRepo: SessionRepository;
}

export interface TeamService {
  create(name: string, description: string | undefined, creatorId: string): Promise<Team>;
  findById(teamId: string): Promise<Team | null>;
  update(teamId: string, data: { name?: string; description?: string }): Promise<Team>;
  addMember(teamId: string, name: string, email?: string): Promise<TeamMember>;
  removeMember(teamId: string, memberId: string, userId: string): Promise<void>;
  getMembers(teamId: string): Promise<TeamMember[]>;
  listTeams(): Promise<Team[]>;
  archive(teamId: string, userId: string): Promise<void>;
  unarchive(teamId: string, userId: string): Promise<void>;
}

/**
 * Factory function for creating the team service.
 * Accepts repository dependencies via injection.
 */
export function createTeamService(deps: TeamServiceDeps): TeamService {
  const { teamRepo, teamMemberRepo, teamMemberRoleRepo, auditLogRepo, sessionRepo } = deps;

  async function create(name: string, description: string | undefined, creatorId: string): Promise<Team> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      throw new ValidationError([
        { field: 'name', message: 'Team name is required', code: 'REQUIRED' },
      ]);
    }

    const team = await teamRepo.create({
      name: trimmedName,
      description: description ?? undefined,
    });

    // Create team member record for the creator
    await teamMemberRepo.create({
      id: creatorId,
      teamId: team.id,
      name: creatorId,
      email: undefined,
    });

    // Assign delivery_manager role to creator
    await teamMemberRoleRepo.assign({
      memberId: creatorId,
      teamId: team.id,
      role: 'delivery_manager',
    });

    // Log audit entry
    await auditLogRepo.create({
      teamId: team.id,
      changeType: 'team_created',
      previousValue: '',
      newValue: JSON.stringify({ name: trimmedName, description }),
      userId: creatorId,
    });

    return team;
  }

  async function addMember(teamId: string, name: string, email?: string): Promise<TeamMember> {
    // 1. Validate name and email using Zod schema (handles trim + min/max + email format)
    const parsed = addMemberSchema.safeParse({ name, email });
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError(fields);
    }

    const trimmedName = parsed.data.name;
    const validatedEmail = parsed.data.email;

    // 2. Check uniqueness via teamMemberRepo.findByTeamAndNameEmail
    const existing = await teamMemberRepo.findByTeamAndNameEmail(teamId, trimmedName, validatedEmail);
    if (existing) {
      throw new ConflictError(
        `Member with name "${trimmedName}" and email "${validatedEmail ?? ''}" already exists in this team`
      );
    }

    // 3. Create member
    const member = await teamMemberRepo.create({
      teamId,
      name: trimmedName,
      email: validatedEmail,
    });

    return member;
  }

  /** Requirement 1.6: Remove member — disassociates without deleting response history, logs audit */
  async function removeMember(teamId: string, memberId: string, userId: string): Promise<void> {
    // 1. Verify member exists and belongs to this team
    const member = await teamMemberRepo.findById(memberId);
    if (!member || member.teamId !== teamId) {
      throw new NotFoundError(`Team member not found in this team`);
    }

    // 2. Remove member from team (only the member record, NOT their responses)
    await teamMemberRepo.remove(memberId);

    // 3. Log audit entry
    await auditLogRepo.create({
      teamId,
      changeType: 'member_removed',
      previousValue: JSON.stringify({ name: member.name, email: member.email }),
      newValue: JSON.stringify({ name: member.name, removedBy: userId }),
      userId,
    });
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

  /** Requirement 1.7: Display list of current team members */
  async function getMembers(teamId: string): Promise<TeamMember[]> {
    return teamMemberRepo.findByTeamId(teamId);
  }

  /** List all teams */
  async function listTeams(): Promise<Team[]> {
    return teamRepo.list();
  }

  /** Find a team by ID */
  async function findById(teamId: string): Promise<Team | null> {
    return teamRepo.findById(teamId);
  }

  /** Update team name/description */
  async function update(teamId: string, data: { name?: string; description?: string }): Promise<Team> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const updateData: Partial<Pick<Team, 'name' | 'description'>> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    return teamRepo.update(teamId, updateData);
  }

  return { create, findById, update, addMember, removeMember, getMembers, listTeams, archive, unarchive };
}
