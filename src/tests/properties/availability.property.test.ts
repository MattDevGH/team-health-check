import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createAvailabilityService } from '@/lib/services/availability.service';

/**
 * **Validates: Requirements 12.1, 12.2**
 *
 * Property 30: Availability exclusion from participation
 *
 * For any team member marked as away during a health check session's duration,
 * they SHALL be excluded from participation counts, SHALL NOT receive any prompts
 * or reminders, and their absence SHALL NOT be treated as non-response for any metric.
 *
 * Test approach: generate a team with N members (3-10), mark M of them as away
 * for a date range covering a session date, then verify that isAway returns true
 * for exactly the marked-away set and false for the rest.
 */
describe('Availability Exclusion Properties', () => {
  /**
   * Generates a list of unique member IDs (3-10 members).
   */
  const memberIdsArb = fc
    .integer({ min: 3, max: 10 })
    .chain((n) =>
      fc.array(fc.uuid(), { minLength: n, maxLength: n }).map((ids) =>
        // Ensure uniqueness by appending index
        ids.map((id, i) => `member-${i}-${id}`)
      )
    );

  /**
   * Generates a session date range (awayFrom before awayUntil) and a check date
   * that falls within the range.
   */
  const dateRangeArb = fc
    .integer({ min: 0, max: 365 })
    .chain((startOffset) =>
      fc.integer({ min: 1, max: 30 }).map((duration) => {
        const baseDate = new Date('2025-01-01T00:00:00Z');
        const awayFrom = new Date(baseDate.getTime() + startOffset * 86400000);
        const awayUntil = new Date(awayFrom.getTime() + duration * 86400000);
        // Check date is midpoint of the range
        const checkDate = new Date(
          awayFrom.getTime() + Math.floor((duration * 86400000) / 2)
        );
        return { awayFrom, awayUntil, checkDate };
      })
    );

  describe('Property 30: Availability exclusion from participation', () => {
    it('isAway returns true for exactly the set of members marked as away', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberIdsArb,
          dateRangeArb,
          async (memberIds, { awayFrom, awayUntil, checkDate }) => {
            const repos = createInMemoryRepositories();
            const availabilityService = createAvailabilityService({
              availabilityRepo: repos.availability,
            });

            // Pick a random subset to mark as away (at least 1, at most N-1 to have both groups)
            const awayCount = Math.max(1, Math.floor(memberIds.length / 2));
            const awayMembers = new Set(memberIds.slice(0, awayCount));
            const presentMembers = new Set(memberIds.slice(awayCount));

            // Mark away members
            for (const memberId of awayMembers) {
              await availabilityService.markAway(memberId, awayFrom, awayUntil);
            }

            // Verify: every away member is detected as away on the check date
            for (const memberId of awayMembers) {
              const result = await availabilityService.isAway(memberId, checkDate);
              expect(result).toBe(true);
            }

            // Verify: every present member is NOT detected as away on the check date
            for (const memberId of presentMembers) {
              const result = await availabilityService.isAway(memberId, checkDate);
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isAway returns false for away members on dates outside their away range', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberIdsArb,
          dateRangeArb,
          fc.integer({ min: 1, max: 30 }),
          async (memberIds, { awayFrom, awayUntil }, offsetDays) => {
            const repos = createInMemoryRepositories();
            const availabilityService = createAvailabilityService({
              availabilityRepo: repos.availability,
            });

            // Mark all members as away for the given range
            for (const memberId of memberIds) {
              await availabilityService.markAway(memberId, awayFrom, awayUntil);
            }

            // Check a date AFTER the away period
            const afterDate = new Date(
              awayUntil.getTime() + offsetDays * 86400000 + 1
            );

            // Every member should NOT be away outside the range
            for (const memberId of memberIds) {
              const result = await availabilityService.isAway(memberId, afterDate);
              expect(result).toBe(false);
            }

            // Check a date BEFORE the away period
            const beforeDate = new Date(
              awayFrom.getTime() - offsetDays * 86400000 - 1
            );

            for (const memberId of memberIds) {
              const result = await availabilityService.isAway(memberId, beforeDate);
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
