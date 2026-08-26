/**
 * Unit tests for privacy.service.ts
 * Tests privacy mode retrieval and mode switching with audit logging.
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.8
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createPrivacyService } from '@/lib/services/privacy.service';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

describe('PrivacyService', () => {
  let repos: Repositories;
  let privacyService: ReturnType<typeof createPrivacyService>;
  let teamId: string;
  let userId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    privacyService = createPrivacyService({
      teamRepo: repos.team,
      auditLogRepo: repos.auditLog,
    });

    const team = await repos.team.create({ name: 'Test Team' });
    teamId = team.id;

    const member = await repos.teamMember.create({ teamId, name: 'Alice', email: 'alice@test.com' });
    userId = member.id;
  });

  describe('getMode', () => {
    it('should return "anonymous" as the default privacy mode', async () => {
      const mode = await privacyService.getMode(teamId);
      expect(mode).toBe('anonymous');
    });

    it('should return "attributed" when team is set to attributed mode', async () => {
      await repos.team.update(teamId, { privacyMode: 'attributed' });

      const mode = await privacyService.getMode(teamId);
      expect(mode).toBe('attributed');
    });

    it('should throw NotFoundError for a non-existent team', async () => {
      await expect(
        privacyService.getMode('nonexistent-team-id')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('switchMode', () => {
    it('should switch to attributed mode when confirmation is provided', async () => {
      await privacyService.switchMode(teamId, 'attributed', userId, true);

      const team = await repos.team.findById(teamId);
      expect(team!.privacyMode).toBe('attributed');
    });

    it('should throw ForbiddenError when switching to attributed without confirmation', async () => {
      await expect(
        privacyService.switchMode(teamId, 'attributed', userId, false)
      ).rejects.toThrow(ForbiddenError);

      // Team should remain unchanged
      const team = await repos.team.findById(teamId);
      expect(team!.privacyMode).toBe('anonymous');
    });

    it('should switch from attributed to anonymous without requiring confirmation', async () => {
      // First switch to attributed
      await repos.team.update(teamId, { privacyMode: 'attributed' });

      // Switch back to anonymous without confirmation
      await privacyService.switchMode(teamId, 'anonymous', userId, false);

      const team = await repos.team.findById(teamId);
      expect(team!.privacyMode).toBe('anonymous');
    });

    it('should log an audit entry when switching mode', async () => {
      await privacyService.switchMode(teamId, 'attributed', userId, true);

      const auditEntries = await repos.auditLog.findByTeamId(teamId);
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].changeType).toBe('privacy_mode_changed');
      expect(auditEntries[0].previousValue).toBe('anonymous');
      expect(auditEntries[0].newValue).toBe('attributed');
      expect(auditEntries[0].userId).toBe(userId);
    });

    it('should log audit entry when switching back to anonymous', async () => {
      await repos.team.update(teamId, { privacyMode: 'attributed' });

      await privacyService.switchMode(teamId, 'anonymous', userId, false);

      const auditEntries = await repos.auditLog.findByTeamId(teamId);
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].changeType).toBe('privacy_mode_changed');
      expect(auditEntries[0].previousValue).toBe('attributed');
      expect(auditEntries[0].newValue).toBe('anonymous');
    });

    it('should throw NotFoundError for a non-existent team', async () => {
      await expect(
        privacyService.switchMode('nonexistent-team-id', 'attributed', userId, true)
      ).rejects.toThrow(NotFoundError);
    });

    it('should not log audit entry when mode is unchanged', async () => {
      // Team is already anonymous, try switching to anonymous
      await privacyService.switchMode(teamId, 'anonymous', userId, false);

      const auditEntries = await repos.auditLog.findByTeamId(teamId);
      expect(auditEntries).toHaveLength(0);
    });
  });
});
