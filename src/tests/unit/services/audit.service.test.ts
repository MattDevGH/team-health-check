/**
 * Unit tests for audit.service.ts
 * Tests append-only audit logging and read-only retrieval.
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuditService } from '@/lib/services/audit.service';

describe('AuditService', () => {
  let repos: Repositories;
  let auditService: ReturnType<typeof createAuditService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    auditService = createAuditService({
      auditLogRepo: repos.auditLog,
    });

    const team = await repos.team.create({ name: 'Test Team' });
    teamId = team.id;
  });

  describe('log', () => {
    it('should create an audit entry with correct fields', async () => {
      await auditService.log({
        teamId,
        changeType: 'privacy_mode_changed',
        previousValue: 'anonymous',
        newValue: 'attributed',
        userId: 'user-1',
      });

      const entries = await repos.auditLog.findByTeamId(teamId);
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.teamId).toBe(teamId);
      expect(entry.changeType).toBe('privacy_mode_changed');
      expect(entry.previousValue).toBe('anonymous');
      expect(entry.newValue).toBe('attributed');
      expect(entry.userId).toBe('user-1');
    });

    it('should store a UTC timestamp with at least second-level precision', async () => {
      const before = new Date();

      await auditService.log({
        teamId,
        changeType: 'schedule_changed',
        previousValue: '',
        newValue: JSON.stringify({ cadence: 'weekly' }),
        userId: 'user-1',
      });

      const after = new Date();
      const entries = await repos.auditLog.findByTeamId(teamId);
      const entry = entries[0];

      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should be append-only — multiple logs accumulate', async () => {
      await auditService.log({
        teamId,
        changeType: 'member_added',
        previousValue: '',
        newValue: JSON.stringify({ name: 'Alice' }),
        userId: 'user-1',
      });

      await auditService.log({
        teamId,
        changeType: 'member_removed',
        previousValue: JSON.stringify({ name: 'Alice' }),
        newValue: '',
        userId: 'user-1',
      });

      const entries = await repos.auditLog.findByTeamId(teamId);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getLog', () => {
    it('should return entries in reverse chronological order (most recent first)', async () => {
      // Create entries with slight time gaps to ensure ordering
      await auditService.log({
        teamId,
        changeType: 'first_change',
        previousValue: '',
        newValue: 'first',
        userId: 'user-1',
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await auditService.log({
        teamId,
        changeType: 'second_change',
        previousValue: 'first',
        newValue: 'second',
        userId: 'user-1',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await auditService.log({
        teamId,
        changeType: 'third_change',
        previousValue: 'second',
        newValue: 'third',
        userId: 'user-1',
      });

      const entries = await auditService.getLog(teamId);

      expect(entries).toHaveLength(3);
      expect(entries[0].changeType).toBe('third_change');
      expect(entries[1].changeType).toBe('second_change');
      expect(entries[2].changeType).toBe('first_change');
    });

    it('should support pagination with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await auditService.log({
          teamId,
          changeType: `change_${i}`,
          previousValue: '',
          newValue: `value_${i}`,
          userId: 'user-1',
        });
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const entries = await auditService.getLog(teamId, { limit: 2 });
      expect(entries).toHaveLength(2);
      // Should be the two most recent
      expect(entries[0].changeType).toBe('change_4');
      expect(entries[1].changeType).toBe('change_3');
    });

    it('should support pagination with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await auditService.log({
          teamId,
          changeType: `change_${i}`,
          previousValue: '',
          newValue: `value_${i}`,
          userId: 'user-1',
        });
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Get the first page
      const firstPage = await auditService.getLog(teamId, { limit: 2 });
      expect(firstPage).toHaveLength(2);

      // Use the last entry's id as cursor
      const cursor = firstPage[firstPage.length - 1].id;
      const secondPage = await auditService.getLog(teamId, { cursor, limit: 2 });
      expect(secondPage).toHaveLength(2);
      expect(secondPage[0].changeType).toBe('change_2');
      expect(secondPage[1].changeType).toBe('change_1');
    });

    it('should return empty array for a team with no entries', async () => {
      const otherTeam = await repos.team.create({ name: 'Other Team' });
      const entries = await auditService.getLog(otherTeam.id);
      expect(entries).toHaveLength(0);
    });
  });

  describe('immutability — no modify/delete exposed', () => {
    it('should not expose any update or delete methods on the service interface', () => {
      const serviceKeys = Object.keys(auditService);
      expect(serviceKeys).toContain('log');
      expect(serviceKeys).toContain('getLog');
      // Must NOT have update/delete/modify/remove
      expect(serviceKeys).not.toContain('update');
      expect(serviceKeys).not.toContain('delete');
      expect(serviceKeys).not.toContain('modify');
      expect(serviceKeys).not.toContain('remove');
      expect(serviceKeys).not.toContain('edit');
      // Only log and getLog should be exposed
      expect(serviceKeys).toHaveLength(2);
    });
  });

  describe('no individual scores in audit', () => {
    it('should not store individual response scores in audit entries', async () => {
      // Simulate a team configuration change — audit entries should only contain
      // team-level configuration events, never individual scores
      await auditService.log({
        teamId,
        changeType: 'privacy_mode_changed',
        previousValue: 'anonymous',
        newValue: 'attributed',
        userId: 'user-1',
      });

      const entries = await auditService.getLog(teamId);
      const entry = entries[0];

      // Verify the entry contains config-level data, not scores
      expect(entry.changeType).toBe('privacy_mode_changed');
      expect(entry.previousValue).not.toMatch(/score/i);
      expect(entry.newValue).not.toMatch(/score/i);
    });
  });
});
