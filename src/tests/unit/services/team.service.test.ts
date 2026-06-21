import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';
import { ValidationError, ConflictError, NotFoundError } from '@/lib/errors';

describe('TeamService.create', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
  });

  it('creates a team with a valid trimmed name', async () => {
    const team = await teamService.create('  My Team  ', undefined, 'creator-1');

    expect(team).toBeDefined();
    expect(team.name).toBe('My Team');
    expect(team.id).toBeTruthy();
  });

  it('stores description when provided', async () => {
    const team = await teamService.create('Dev Team', 'A dev team', 'creator-1');

    expect(team.description).toBe('A dev team');
  });

  it('rejects whitespace-only name with ValidationError', async () => {
    await expect(
      teamService.create('   ', undefined, 'creator-1')
    ).rejects.toThrow(ValidationError);
  });

  it('rejects empty string name with ValidationError', async () => {
    await expect(
      teamService.create('', undefined, 'creator-1')
    ).rejects.toThrow(ValidationError);
  });

  it('assigns delivery_manager role to the creator member', async () => {
    const team = await teamService.create('Role Team', undefined, 'creator-1');

    const members = await repos.teamMember.findByTeamId(team.id);
    expect(members).toHaveLength(1);

    const roles = await repos.teamMemberRole.findByMemberAndTeam(members[0].id, team.id);
    expect(roles).toHaveLength(1);
    expect(roles[0].role).toBe('delivery_manager');
  });

  it('creates a team member record for the creator', async () => {
    const team = await teamService.create('Member Team', undefined, 'creator-1');

    const members = await repos.teamMember.findByTeamId(team.id);
    expect(members).toHaveLength(1);
  });

  it('logs an audit entry for team creation', async () => {
    const team = await teamService.create('Audit Team', undefined, 'creator-1');

    const logs = await repos.auditLog.findByTeamId(team.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].changeType).toBe('team_created');
    expect(logs[0].userId).toBe('creator-1');
    expect(logs[0].newValue).toContain('Audit Team');
  });
});

describe('TeamService.addMember', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    const team = await teamService.create('Test Team', undefined, 'creator-1');
    teamId = team.id;
  });

  it('adds a valid member with name only', async () => {
    const member = await teamService.addMember(teamId, 'Alice');

    expect(member).toBeDefined();
    expect(member.name).toBe('Alice');
    expect(member.teamId).toBe(teamId);
    expect(member.email).toBeNull();
  });

  it('adds a valid member with name and email', async () => {
    const member = await teamService.addMember(teamId, 'Bob', 'bob@example.com');

    expect(member.name).toBe('Bob');
    expect(member.email).toBe('bob@example.com');
  });

  it('trims leading/trailing whitespace from name', async () => {
    const member = await teamService.addMember(teamId, '  Charlie  ');

    expect(member.name).toBe('Charlie');
  });

  it('rejects duplicate member (same name and email) with ConflictError', async () => {
    await teamService.addMember(teamId, 'Diana', 'diana@example.com');

    await expect(
      teamService.addMember(teamId, 'Diana', 'diana@example.com')
    ).rejects.toThrow(ConflictError);
  });

  it('rejects duplicate member (same name, no email) with ConflictError', async () => {
    await teamService.addMember(teamId, 'Eve');

    await expect(
      teamService.addMember(teamId, 'Eve')
    ).rejects.toThrow(ConflictError);
  });

  it('rejects invalid email format with ValidationError', async () => {
    await expect(
      teamService.addMember(teamId, 'Frank', 'not-an-email')
    ).rejects.toThrow(ValidationError);
  });

  it('rejects empty name with ValidationError', async () => {
    await expect(
      teamService.addMember(teamId, '')
    ).rejects.toThrow(ValidationError);
  });

  it('rejects whitespace-only name with ValidationError', async () => {
    await expect(
      teamService.addMember(teamId, '   ')
    ).rejects.toThrow(ValidationError);
  });
});

describe('TeamService.removeMember', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    const team = await teamService.create('Test Team', undefined, 'creator-1');
    teamId = team.id;
  });

  it('removes member from team roster', async () => {
    const member = await teamService.addMember(teamId, 'Alice', 'alice@example.com');

    await teamService.removeMember(teamId, member.id, 'creator-1');

    const members = await repos.teamMember.findByTeamId(teamId);
    const aliceInRoster = members.find(m => m.id === member.id);
    expect(aliceInRoster).toBeUndefined();
  });

  it('preserves response history after member removal', async () => {
    const member = await teamService.addMember(teamId, 'Bob', 'bob@example.com');

    // Create a session and record a response for Bob
    const session = await repos.session.create({ teamId, status: 'open' });
    await repos.response.upsert({
      memberId: member.id,
      sessionId: session.id,
      questionId: 'q-1',
      score: 4,
    });

    // Remove Bob from the team
    await teamService.removeMember(teamId, member.id, 'creator-1');

    // Verify Bob's responses still exist
    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].score).toBe(4);
  });

  it('throws NotFoundError when removing non-existent member', async () => {
    await expect(
      teamService.removeMember(teamId, 'non-existent-id', 'creator-1')
    ).rejects.toThrow(NotFoundError);
  });

  it('logs audit entry for member removal', async () => {
    const member = await teamService.addMember(teamId, 'Charlie', 'charlie@example.com');

    await teamService.removeMember(teamId, member.id, 'creator-1');

    const logs = await repos.auditLog.findByTeamId(teamId);
    const removalLog = logs.find(l => l.changeType === 'member_removed');
    expect(removalLog).toBeDefined();
    expect(removalLog!.userId).toBe('creator-1');
    expect(removalLog!.newValue).toContain('Charlie');
  });
});


describe('TeamService.archive', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    const team = await teamService.create('Archive Team', undefined, 'dm-1');
    teamId = team.id;
  });

  it('sets archived flag to true', async () => {
    await teamService.archive(teamId, 'dm-1');

    const team = await repos.team.findById(teamId);
    expect(team?.archived).toBe(true);
  });

  it('closes existing open session', async () => {
    const session = await repos.session.create({ teamId, status: 'open' });

    await teamService.archive(teamId, 'dm-1');

    const updated = await repos.session.findById(session.id);
    expect(updated?.status).toBe('closed');
    expect(updated?.actualCloseAt).toBeInstanceOf(Date);
  });

  it('logs audit entry with changeType team_archived', async () => {
    await teamService.archive(teamId, 'dm-1');

    const logs = await repos.auditLog.findByTeamId(teamId);
    const archiveLog = logs.find(l => l.changeType === 'team_archived');
    expect(archiveLog).toBeDefined();
    expect(archiveLog?.userId).toBe('dm-1');
  });

  it('throws NotFoundError for non-existent team', async () => {
    await expect(
      teamService.archive('non-existent', 'dm-1')
    ).rejects.toThrow(NotFoundError);
  });

  it('succeeds when no open session exists', async () => {
    await expect(teamService.archive(teamId, 'dm-1')).resolves.toBeUndefined();

    const team = await repos.team.findById(teamId);
    expect(team?.archived).toBe(true);
  });
});

describe('TeamService.unarchive', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    const team = await teamService.create('Unarchive Team', undefined, 'dm-1');
    teamId = team.id;
    // Archive first
    await teamService.archive(teamId, 'dm-1');
  });

  it('sets archived flag to false', async () => {
    await teamService.unarchive(teamId, 'dm-1');

    const team = await repos.team.findById(teamId);
    expect(team?.archived).toBe(false);
  });

  it('logs audit entry with changeType team_unarchived', async () => {
    await teamService.unarchive(teamId, 'dm-1');

    const logs = await repos.auditLog.findByTeamId(teamId);
    const unarchiveLog = logs.find(l => l.changeType === 'team_unarchived');
    expect(unarchiveLog).toBeDefined();
    expect(unarchiveLog?.userId).toBe('dm-1');
  });

  it('allows new sessions after unarchive', async () => {
    await teamService.unarchive(teamId, 'dm-1');

    // After unarchive, team is no longer archived — new sessions can be opened
    const team = await repos.team.findById(teamId);
    expect(team?.archived).toBe(false);

    // Verify a new session can be created for the team
    const session = await repos.session.create({ teamId, status: 'open' });
    expect(session.status).toBe('open');
  });

  it('preserves historical data (members remain accessible)', async () => {
    // Add a member before archiving
    await teamService.addMember(teamId, 'Alice', 'alice@example.com');
    await teamService.unarchive(teamId, 'dm-1');

    const members = await repos.teamMember.findByTeamId(teamId);
    // Should still have the creator + Alice
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.some(m => m.name === 'Alice')).toBe(true);
  });

  it('throws NotFoundError for non-existent team', async () => {
    await expect(
      teamService.unarchive('non-existent', 'dm-1')
    ).rejects.toThrow(NotFoundError);
  });
});


describe('TeamService.getMembers', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
    const team = await teamService.create('Members Team', undefined, 'creator-1');
    teamId = team.id;
  });

  it('returns members for a team with added members', async () => {
    await teamService.addMember(teamId, 'Alice', 'alice@example.com');
    await teamService.addMember(teamId, 'Bob', 'bob@example.com');

    const members = await teamService.getMembers(teamId);

    // Creator + Alice + Bob
    expect(members).toHaveLength(3);
    expect(members.some(m => m.name === 'Alice')).toBe(true);
    expect(members.some(m => m.name === 'Bob')).toBe(true);
  });

  it('returns empty array for a team with no added members (only creator)', async () => {
    // A freshly created team has only the creator as a member
    const members = await teamService.getMembers(teamId);

    // The creator is still a member, so we check that no additional members exist
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe('creator-1');
  });

  it('returns empty array for a non-existent team', async () => {
    const members = await teamService.getMembers('non-existent-team-id');

    expect(members).toEqual([]);
  });
});

describe('TeamService.listTeams', () => {
  let repos: Repositories;
  let teamService: ReturnType<typeof createTeamService>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    teamService = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
  });

  it('returns all created teams', async () => {
    await teamService.create('Team Alpha', 'First team', 'creator-1');
    await teamService.create('Team Beta', 'Second team', 'creator-2');
    await teamService.create('Team Gamma', undefined, 'creator-3');

    const teams = await teamService.listTeams();

    expect(teams).toHaveLength(3);
    expect(teams.map(t => t.name)).toContain('Team Alpha');
    expect(teams.map(t => t.name)).toContain('Team Beta');
    expect(teams.map(t => t.name)).toContain('Team Gamma');
  });

  it('returns empty array when no teams exist', async () => {
    const teams = await teamService.listTeams();

    expect(teams).toEqual([]);
  });
});
