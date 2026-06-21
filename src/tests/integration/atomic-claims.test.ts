/**
 * Integration tests: Atomic token claims under concurrency.
 * Validates: Property 15 (magic link single-use), Requirements 7.2, 7.9
 *
 * Uses in-memory repositories which simulate CAS via JavaScript's
 * single-threaded nature. Real SQLite row-locking tests in Task 18.x.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { createGenesisService } from '@/lib/services/genesis.service';
import { NotFoundError, ConflictError } from '@/lib/errors';

const CONCURRENCY = 5;

describe('Atomic token claims - concurrency', () => {
  let repos: Repositories;

  beforeEach(() => {
    repos = createInMemoryRepositories();
  });

  describe('verifyMagicLink', () => {
    it('exactly 1 succeeds out of N concurrent claims', async () => {
      // 1. Create a team member so the magic link resolves to 'authenticated'
      const member = await repos.teamMember.create({
        teamId: 'team-1',
        name: 'Alice',
        email: 'alice@example.com',
      });

      // 2. Create a magic link for that member
      const token = 'test-magic-token-12345';
      await repos.magicLink.create({
        token,
        memberId: member.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      // 3. Build the auth service
      const authService: AuthService = createAuthService({
        pairingCodeRepo: repos.pairingCode,
        magicLinkRepo: repos.magicLink,
        teamMemberRepo: repos.teamMember,
        userSessionRepo: repos.userSession,
        pendingGenesisRepo: repos.pendingGenesis,
      });

      // 4. Fire N concurrent calls with the same token
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () => authService.verifyMagicLink(token))
      );

      // 5. Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(CONCURRENCY - 1);

      // 6. Verify the successful result is 'authenticated'
      const successResult = (successes[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof authService.verifyMagicLink>>>).value;
      expect(successResult.status).toBe('authenticated');
      if (successResult.status === 'authenticated') {
        expect(successResult.memberId).toBe(member.id);
        expect(successResult.sessionToken).toBeDefined();
      }

      // 7. Verify all failures are NotFoundError
      for (const failure of failures) {
        const reason = (failure as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(NotFoundError);
      }

      // 8. Verify exactly 1 UserSession was created by checking the session token
      if (successResult.status === 'authenticated') {
        const session = await repos.userSession.findByToken(successResult.sessionToken);
        expect(session).not.toBeNull();
        expect(session!.memberId).toBe(member.id);
      }
    });
  });

  describe('executeGenesis', () => {
    it('exactly 1 succeeds out of N concurrent claims', async () => {
      // 1. Create a PendingGenesis token
      const token = 'test-genesis-token-67890';
      await repos.pendingGenesis.create({
        token,
        email: 'founder@startup.com',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      // 2. Build the genesis service
      const genesisService = createGenesisService({
        pendingGenesisRepo: repos.pendingGenesis,
        teamRepo: repos.team,
        teamMemberRepo: repos.teamMember,
        teamMemberRoleRepo: repos.teamMemberRole,
        userSessionRepo: repos.userSession,
      });

      // 3. Fire N concurrent calls with the same token
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENCY }, () => genesisService.executeGenesis(token))
      );

      // 4. Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(CONCURRENCY - 1);

      // 5. Verify the successful result contains teamId, memberId, sessionToken
      const successResult = (successes[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof genesisService.executeGenesis>>>).value;
      expect(successResult.teamId).toBeDefined();
      expect(successResult.memberId).toBeDefined();
      expect(successResult.sessionToken).toBeDefined();

      // 6. Verify all failures are ConflictError (token already used)
      for (const failure of failures) {
        const reason = (failure as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(ConflictError);
      }

      // 7. Verify exactly 1 team was created
      const teams = await repos.team.list();
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe(successResult.teamId);

      // 8. Verify exactly 1 member was created
      const members = await repos.teamMember.findByTeamId(successResult.teamId);
      expect(members).toHaveLength(1);
      expect(members[0].id).toBe(successResult.memberId);
      expect(members[0].email).toBe('founder@startup.com');
    });
  });
});
