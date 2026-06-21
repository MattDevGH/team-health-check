/**
 * Unit tests for genesis.service.ts
 * Tests atomic team creation flow with CAS token verification.
 * Validates: Requirements 7.9, 19.4
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createGenesisService } from '@/lib/services/genesis.service';
import { NotFoundError, ConflictError } from '@/lib/errors';

describe('GenesisService', () => {
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

  describe('executeGenesis', () => {
    it('should create team, member, role, and session for a valid token', async () => {
      // Arrange: create a valid pending genesis token
      const genesis = await repos.pendingGenesis.create({
        token: 'valid-token-abc',
        email: 'alice@example.com',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      });

      // Act
      const result = await genesisService.executeGenesis(genesis.token);

      // Assert: result shape
      expect(result.teamId).toBeDefined();
      expect(result.memberId).toBeDefined();
      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken.length).toBe(64); // 32 bytes hex

      // Assert: team was created
      const team = await repos.team.findById(result.teamId);
      expect(team).not.toBeNull();
      expect(team!.name).toBe('My Team');

      // Assert: member was created with email from genesis
      const members = await repos.teamMember.findByTeamId(result.teamId);
      expect(members).toHaveLength(1);
      expect(members[0].email).toBe('alice@example.com');
      expect(members[0].id).toBe(result.memberId);

      // Assert: delivery_manager role was assigned
      const roles = await repos.teamMemberRole.findByMemberAndTeam(result.memberId, result.teamId);
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe('delivery_manager');

      // Assert: user session was created with 7-day expiry
      const session = await repos.userSession.findByToken(result.sessionToken);
      expect(session).not.toBeNull();
      expect(session!.memberId).toBe(result.memberId);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiryDiff = session!.expiresAt.getTime() - Date.now();
      expect(expiryDiff).toBeGreaterThan(sevenDaysMs - 5000); // within 5s tolerance
      expect(expiryDiff).toBeLessThanOrEqual(sevenDaysMs);
    });

    it('should throw ConflictError when token is already used', async () => {
      // Arrange: create and use a token
      const genesis = await repos.pendingGenesis.create({
        token: 'once-use-token',
        email: 'bob@example.com',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      // First call succeeds
      await genesisService.executeGenesis(genesis.token);

      // Act & Assert: second call fails with ConflictError
      await expect(
        genesisService.executeGenesis(genesis.token)
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError when token is expired', async () => {
      // Arrange: create a token that's already expired
      await repos.pendingGenesis.create({
        token: 'expired-token',
        email: 'charlie@example.com',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });

      // Act & Assert
      await expect(
        genesisService.executeGenesis('expired-token')
      ).rejects.toThrow(ConflictError);
    });

    it('should throw NotFoundError when token does not exist', async () => {
      // Act & Assert
      await expect(
        genesisService.executeGenesis('non-existent-token')
      ).rejects.toThrow(NotFoundError);
    });

    it('should allow exactly one success when called concurrently with the same token', async () => {
      // Arrange
      await repos.pendingGenesis.create({
        token: 'concurrent-token',
        email: 'dave@example.com',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      // Act: fire 5 concurrent calls
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => genesisService.executeGenesis('concurrent-token'))
      );

      // Assert: exactly 1 fulfills, rest reject
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);

      // All rejections should be ConflictError
      for (const r of rejected) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
      }
    });
  });
});
