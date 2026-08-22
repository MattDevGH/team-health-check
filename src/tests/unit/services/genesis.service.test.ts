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
