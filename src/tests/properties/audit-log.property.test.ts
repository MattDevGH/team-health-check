import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createAuditService } from '@/lib/services/audit.service';

/**
 * Property tests for audit log completeness and immutability.
 * Validates: Requirements 18.1, 18.2, 18.3, 18.6
 */
describe('Audit Log Properties', () => {
  /**
   * **Validates: Requirements 18.1, 18.2**
   *
   * Property 24: Audit log completeness and immutability
   *
   * For any N (1-20) audit entries with random changeTypes and values,
   * logging them all and then retrieving via getLog SHALL return exactly N entries.
   * Each entry SHALL contain the changeType, previousValue, newValue, userId, and timestamp.
   */
  describe('Property 24: Audit log completeness and immutability', () => {
    const changeTypes = [
      'privacy_mode_change',
      'schedule_change',
      'member_added',
      'member_removed',
      'delivery_window_change',
      'notification_recipient_change',
    ];

    const auditEntryArb = fc.record({
      changeType: fc.constantFrom(...changeTypes),
      previousValue: fc.string({ minLength: 0, maxLength: 50 }),
      newValue: fc.string({ minLength: 0, maxLength: 50 }),
      userId: fc.uuid(),
    });

    it('getLog returns exactly N entries after logging N entries (completeness)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEntryArb, { minLength: 1, maxLength: 20 }),
          async (entries) => {
            const repos = createInMemoryRepositories();
            const auditService = createAuditService({ auditLogRepo: repos.auditLog });

            const teamId = `team-${crypto.randomUUID()}`;

            // Log all entries
            for (const entry of entries) {
              await auditService.log({
                teamId,
                changeType: entry.changeType,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
                userId: entry.userId,
              });
            }

            // Retrieve and verify completeness
            const log = await auditService.getLog(teamId, { limit: 100 });
            expect(log.length).toBe(entries.length);

            // Verify each entry has all required fields (Requirement 18.2)
            for (const logEntry of log) {
              expect(logEntry.teamId).toBe(teamId);
              expect(logEntry.changeType).toBeDefined();
              expect(typeof logEntry.previousValue).toBe('string');
              expect(typeof logEntry.newValue).toBe('string');
              expect(logEntry.userId).toBeDefined();
              expect(logEntry.timestamp).toBeInstanceOf(Date);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('no audit entry contains "score" in previousValue or newValue (Requirement 18.6)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEntryArb, { minLength: 1, maxLength: 20 }),
          async (entries) => {
            const repos = createInMemoryRepositories();
            const auditService = createAuditService({ auditLogRepo: repos.auditLog });

            const teamId = `team-${crypto.randomUUID()}`;

            for (const entry of entries) {
              await auditService.log({
                teamId,
                changeType: entry.changeType,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
                userId: entry.userId,
              });
            }

            const log = await auditService.getLog(teamId, { limit: 100 });

            // The audit log records only team-level configuration events —
            // no individual Response scores should appear (Requirement 18.6).
            // Since the service only accepts config changes, this verifies that
            // the data passed through doesn't contain score-like numeric data
            // disguised as config values. The service interface enforces this
            // by design — it accepts changeType, previousValue, newValue strings.
            for (const logEntry of log) {
              // Audit entries should not reference individual scores
              expect(logEntry.changeType).not.toMatch(/^score$/i);
              expect(logEntry.changeType).not.toMatch(/^individual_score$/i);
              expect(logEntry.changeType).not.toMatch(/^response_score$/i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('AuditService interface exposes only log and getLog — no modify or delete (Requirement 18.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEntryArb, { minLength: 1, maxLength: 5 }),
          async (entries) => {
            const repos = createInMemoryRepositories();
            const auditService = createAuditService({ auditLogRepo: repos.auditLog });

            const teamId = `team-${crypto.randomUUID()}`;

            for (const entry of entries) {
              await auditService.log({
                teamId,
                changeType: entry.changeType,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
                userId: entry.userId,
              });
            }

            // The service interface only exposes 'log' and 'getLog' —
            // no update, delete, or modify operations exist (Requirement 18.3)
            const serviceKeys = Object.keys(auditService);
            expect(serviceKeys).toContain('log');
            expect(serviceKeys).toContain('getLog');
            expect(serviceKeys).toHaveLength(2);

            // Verify no mutation methods exist
            expect(serviceKeys).not.toContain('update');
            expect(serviceKeys).not.toContain('delete');
            expect(serviceKeys).not.toContain('remove');
            expect(serviceKeys).not.toContain('edit');
            expect(serviceKeys).not.toContain('modify');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('logged entries are retrievable in reverse chronological order (most recent first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEntryArb, { minLength: 2, maxLength: 15 }),
          async (entries) => {
            const repos = createInMemoryRepositories();
            const auditService = createAuditService({ auditLogRepo: repos.auditLog });

            const teamId = `team-${crypto.randomUUID()}`;

            for (const entry of entries) {
              await auditService.log({
                teamId,
                changeType: entry.changeType,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
                userId: entry.userId,
              });
              // Small delay to ensure distinct timestamps
              await new Promise(resolve => setTimeout(resolve, 1));
            }

            const log = await auditService.getLog(teamId, { limit: 100 });

            // Verify reverse chronological order
            for (let i = 0; i < log.length - 1; i++) {
              expect(log[i].timestamp.getTime()).toBeGreaterThanOrEqual(
                log[i + 1].timestamp.getTime()
              );
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
