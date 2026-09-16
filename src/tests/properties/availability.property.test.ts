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
/**
 * **Validates: Explaining Itself 5.2, 5.4, 5.5**
 *
 * Property 5 (Explaining Itself): away periods are member-scoped. A member
 * sees and cancels only their own.
 *
 * `removeAway` took an id and deleted whatever it named. The route passed one
 * straight from the request body, so any signed-in member could cancel any
 * other member's away period given its id — and the member who lost it would
 * be prompted through a holiday with nothing on the page to explain why.
 *
 * Generated rather than exampled because the property is about every pairing
 * of member and period, and an example test picks the pairing that occurred to
 * whoever wrote it.
 */
describe('Property 5: away periods are member-scoped', () => {
  const twoMembersArb = fc
    .tuple(fc.uuid(), fc.uuid())
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => [`member-${a}`, `member-${b}`] as const);

  it("refuses to cancel a period belonging to somebody else", async () => {
    await fc.assert(
      fc.asyncProperty(twoMembersArb, async ([mine, theirs]) => {
        const repos = createInMemoryRepositories();
        const service = createAvailabilityService({ availabilityRepo: repos.availability });
        const period = await service.markAway(
          theirs,
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-01-08T00:00:00Z'),
        );

        /*
         * It does not throw. A period belonging to somebody else is treated
         * exactly as one that never existed — which is the honest answer to
         * both questions at once, since a distinct error would confirm that
         * the id names a real period belonging to someone.
         *
         * The outcome asserted is therefore the period surviving, never the
         * shape of the response. A service that deleted and then threw would
         * satisfy a `rejects` assertion while doing the damage.
         */
        await service.removeAway(mine, period.id);

        expect(await service.getAvailability(theirs)).toHaveLength(1);
      }),
      { numRuns: 25 },
    );
  });

  it('cancels a period belonging to the member who asks', async () => {
    await fc.assert(
      fc.asyncProperty(twoMembersArb, async ([mine, theirs]) => {
        const repos = createInMemoryRepositories();
        const service = createAvailabilityService({ availabilityRepo: repos.availability });
        const period = await service.markAway(
          mine,
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-01-08T00:00:00Z'),
        );
        await service.markAway(
          theirs,
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-01-08T00:00:00Z'),
        );

        await service.removeAway(mine, period.id);

        expect(await service.getAvailability(mine)).toEqual([]);
        // and nobody else's went with it
        expect(await service.getAvailability(theirs)).toHaveLength(1);
      }),
      { numRuns: 25 },
    );
  });

  it('takes effect immediately for prompt eligibility', async () => {
    /*
     * Requirement 5.4. Cancelling that left `isAway` true would be the same
     * silence from the other side: a member who cancelled and then heard
     * nothing would have no way to tell whether it had worked.
     */
    const repos = createInMemoryRepositories();
    const service = createAvailabilityService({ availabilityRepo: repos.availability });
    const during = new Date('2026-01-04T12:00:00Z');
    const period = await service.markAway(
      'member-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-08T00:00:00Z'),
    );
    expect(await service.isAway('member-1', during)).toBe(true);

    await service.removeAway('member-1', period.id);

    expect(await service.isAway('member-1', during)).toBe(false);
  });

  it('is harmless to cancel something already gone', async () => {
    // A member who clicks twice, or comes back to a stale page, should get the
    // state they wanted rather than an error about it already being true
    const repos = createInMemoryRepositories();
    const service = createAvailabilityService({ availabilityRepo: repos.availability });
    const period = await service.markAway(
      'member-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-08T00:00:00Z'),
    );
    await service.removeAway('member-1', period.id);

    await expect(service.removeAway('member-1', period.id)).resolves.toBeUndefined();
  });
});

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
