/**
 * Unit tests for genesis.service.ts.
 * Validates: Requirements 7.9, 19.4
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createGenesisService } from '@/lib/services/genesis.service';

describe('GenesisService.executeGenesis', () => {
  let repos: Repositories;
  let genesisService: ReturnType<typeof createGenesisService>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    genesisService = createGenesisService({
      pendingGenesisRepo: repos.pendingGenesis,
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      userSessionRepo: repos.userSession,
      auditLogRepo: repos.auditLog,
    });
  });

  it('creates the team, member, role, and session for a valid token', async () => {
    await repos.pendingGenesis.create({
      token: 'valid-token-abc',
      email: 'alice@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await genesisService.executeGenesis({
      token: 'valid-token-abc',
      teamName: 'Platform Engineering',
      description: 'Owns the delivery platform',
    });

    expect(result.sessionToken).toHaveLength(64);
    const team = await repos.team.findById(result.teamId);
    expect(team).toMatchObject({
      name: 'Platform Engineering',
      description: 'Owns the delivery platform',
    });

    const members = await repos.teamMember.findByTeamId(result.teamId);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: result.memberId, email: 'alice@example.com' });
    const roles = await repos.teamMemberRole.findByMemberAndTeam(result.memberId, result.teamId);
    expect(roles).toHaveLength(1);
    expect(roles[0].role).toBe('delivery_manager');

    const session = await repos.userSession.findByToken(result.sessionToken);
    expect(session?.memberId).toBe(result.memberId);
  });

  it('persists no description when the optional value is omitted', async () => {
    await repos.pendingGenesis.create({
      token: 'no-description',
      email: 'bob@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await genesisService.executeGenesis({
      token: 'no-description',
      teamName: 'Team Without Description',
    });

    expect(await repos.team.findById(result.teamId)).toMatchObject({
      name: 'Team Without Description',
      description: null,
    });
  });

  it('throws ConflictError when the token is already used', async () => {
    await repos.pendingGenesis.create({
      token: 'once-use-token',
      email: 'bob@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const input = { token: 'once-use-token', teamName: 'One Team' };

    await genesisService.executeGenesis(input);

    await expect(genesisService.executeGenesis(input)).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when the token is expired', async () => {
    await repos.pendingGenesis.create({
      token: 'expired-token',
      email: 'charlie@example.com',
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(genesisService.executeGenesis({
      token: 'expired-token',
      teamName: 'Expired Team',
    })).rejects.toThrow(ConflictError);
  });
  it('throws NotFoundError when the token does not exist', async () => {
    await expect(genesisService.executeGenesis({
      token: 'non-existent-token',
      teamName: 'Missing Team',
    })).rejects.toThrow(NotFoundError);
  });

  it('allows exactly one concurrent success for the same token', async () => {
    await repos.pendingGenesis.create({
      token: 'concurrent-token',
      email: 'dave@example.com',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => genesisService.executeGenesis({
        token: 'concurrent-token',
        teamName: 'Concurrent Team',
      })),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(ConflictError);
    }
  });
});

/**
 * Genesis has to record that the team was created.
 *
 * Requirements: Original 18.1, 18.2
 *
 * Found by reading the production database after creating a real team: the
 * audit log was empty. Two routes create teams and only one of them recorded
 * it. `POST /api/teams` persists team, member, role and audit in a single
 * transaction through `createWithCreator`; genesis wrote team, member, role and
 * session, and nothing else.
 *
 * Genesis is the route every real team actually arrives through — it is how a
 * first user starts — so the audit log began mid-story, missing the one entry
 * that explains how the team came to exist and who became its manager.
 *
 * `AI_CONTEXT.md` claimed team creation persisted an audit atomically. True of
 * the tested route, false of the untested one.
 */
describe('GenesisService audits the team it creates', () => {
  let repos: Repositories;
  let genesisService: ReturnType<typeof createGenesisService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    genesisService = createGenesisService({
      pendingGenesisRepo: repos.pendingGenesis,
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      userSessionRepo: repos.userSession,
      auditLogRepo: repos.auditLog,
    });

    await repos.pendingGenesis.create({
      token: 'audit-token',
      email: 'alice@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  });

  async function run() {
    return genesisService.executeGenesis({
      token: 'audit-token',
      teamName: 'Platform Engineering',
      description: 'Owns the delivery platform',
    });
  }

  it('writes an audit entry for the new team', async () => {
    const result = await run();

    const entries = await repos.auditLog.findByTeamId(result.teamId);
    expect(entries).toHaveLength(1);
    expect(entries[0].changeType).toBe('team_created');
  });

  it('attributes it to the member who created the team', async () => {
    // Not a raw string, not empty: the audit log resolves actor ids to names,
    // and an id that matches no member renders as unattributed
    const result = await run();

    const [entry] = await repos.auditLog.findByTeamId(result.teamId);
    const member = await repos.teamMember.findById(entry.userId);

    expect(member).not.toBeNull();
    expect(member?.email).toBe('alice@example.com');
  });

  it('records what was created, so the entry says something', async () => {
    const result = await run();

    const [entry] = await repos.auditLog.findByTeamId(result.teamId);
    expect(entry.newValue).toContain('Platform Engineering');
  });

  it('matches the shape the authenticated route writes', async () => {
    // Both routes create teams. An audit log where the same event has two
    // shapes depending on which door was used is worse than one shape
    const result = await run();

    const [entry] = await repos.auditLog.findByTeamId(result.teamId);
    expect(entry.previousValue).toBe('');
    expect(JSON.parse(entry.newValue)).toMatchObject({ name: 'Platform Engineering' });
  });

  it('writes exactly one entry, not one per created row', async () => {
    const result = await run();

    expect(await repos.auditLog.findByTeamId(result.teamId)).toHaveLength(1);
  });
});
