import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createStreakService } from '@/lib/services/streak.service';

/**
 * **Validates: Requirements 17.1, 17.3, 17.7**
 *
 * Property 22: Streak calculation correctness
 *
 * For any sequence of health check sessions and a team member's participation pattern,
 * the streak count SHALL equal the number of consecutive sessions (most recent first)
 * in which the member submitted at least one response, with the following modifiers:
 * (a) sessions during which the member was marked as away are excluded from consideration,
 * (b) one missed session within a rolling 14-day window does not break the streak.
 */
describe('Property 22: Streak calculation correctness', () => {
  // Each session event is: 'responded' | 'missed' | 'away'
  const sessionStatusArb = fc.constantFrom('responded', 'missed', 'away');

  it('streak matches expected calculation for arbitrary participation sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 5-20 session statuses
        fc.array(sessionStatusArb, { minLength: 5, maxLength: 20 }),
        // Generate base gap between sessions in days (1-10 days apart)
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 19, maxLength: 19 }),
        async (statuses, gaps) => {
          const repos = createInMemoryRepositories();

          // Set up team and member
          const team = await repos.team.create({
            name: 'Streak Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Streak Member',
          });

          // Create sessions with controlled close dates
          const baseTime = new Date('2024-01-01T10:00:00Z').getTime();
          const DAY_MS = 24 * 60 * 60 * 1000;

          let cumulativeTime = baseTime;

          for (let i = 0; i < statuses.length; i++) {
            const sessionCloseTime = new Date(cumulativeTime);

            // Create a closed session
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            // Update with actualCloseAt
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: sessionCloseTime,
            });

            const status = statuses[i];

            if (status === 'away') {
              // Mark member as away during this session only (tight window: ±1 hour)
              await repos.availability.create({
                memberId: member.id,
                awayFrom: new Date(sessionCloseTime.getTime() - 60 * 60 * 1000),
                awayUntil: new Date(sessionCloseTime.getTime() + 60 * 60 * 1000),
              });
            } else if (status === 'responded') {
              // Submit a response for this session
              await repos.response.upsert({
                memberId: member.id,
                sessionId: session.id,
                questionId: 'q-delivering-value',
                score: 3,
              });
            }
            // 'missed' = no response, no away marking

            // Advance time by the gap for the next session
            const gap = gaps[Math.min(i, gaps.length - 1)];
            cumulativeTime += gap * DAY_MS;
          }

          // Calculate expected streak manually using the same rules
          const expected = calculateExpectedStreak(statuses, gaps, DAY_MS);

          // Run the streak service
          const streakService = createStreakService({
            sessionRepo: repos.session,
            responseRepo: repos.response,
            availabilityRepo: repos.availability,
            teamMemberRepo: repos.teamMember,
          });

          const result = await streakService.calculate(member.id);

          expect(result.current).toBe(expected.current);
          expect(result.best).toBe(expected.best);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('away sessions do not affect streak (neither break nor contribute)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a streak length (1-10 consecutive responses)
        fc.integer({ min: 1, max: 10 }),
        // Then insert N away sessions interspersed
        fc.integer({ min: 1, max: 5 }),
        async (streakLength, awayCount) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Away Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Away Member',
          });

          const DAY_MS = 24 * 60 * 60 * 1000;
          let time = new Date('2024-01-01T10:00:00Z').getTime();

          // Create responded sessions interspersed with away sessions
          for (let i = 0; i < streakLength + awayCount; i++) {
            const sessionCloseTime = new Date(time);
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: sessionCloseTime,
            });

            if (i < awayCount) {
              // First `awayCount` sessions are away (tight window: ±1 hour)
              await repos.availability.create({
                memberId: member.id,
                awayFrom: new Date(time - 60 * 60 * 1000),
                awayUntil: new Date(time + 60 * 60 * 1000),
              });
            } else {
              // Remaining sessions are responded
              await repos.response.upsert({
                memberId: member.id,
                sessionId: session.id,
                questionId: 'q-delivering-value',
                score: 4,
              });
            }

            time += 7 * DAY_MS; // Weekly cadence
          }

          const streakService = createStreakService({
            sessionRepo: repos.session,
            responseRepo: repos.response,
            availabilityRepo: repos.availability,
            teamMemberRepo: repos.teamMember,
          });

          const result = await streakService.calculate(member.id);

          // Away sessions at the start should not affect the streak built afterwards
          expect(result.current).toBe(streakLength);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('grace period: one miss within 14 days does not break streak', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Streak before the grace miss (1-5)
        fc.integer({ min: 1, max: 5 }),
        // Gap in days between the last responded session and the missed session (1-14)
        fc.integer({ min: 1, max: 14 }),
        // Whether member responds after the grace period miss
        fc.boolean(),
        async (streakBefore, graceDayGap, respondsAfter) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Grace Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Grace Member',
          });

          const DAY_MS = 24 * 60 * 60 * 1000;
          let time = new Date('2024-01-01T10:00:00Z').getTime();

          // Build initial streak
          for (let i = 0; i < streakBefore; i++) {
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: new Date(time),
            });
            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId: 'q-delivering-value',
              score: 4,
            });
            time += 7 * DAY_MS;
          }

          // Miss one session within grace period (gap <= 14 days)
          const missSession = await repos.session.create({
            teamId: team.id,
            status: 'closed',
          });
          await repos.session.update(missSession.id, {
            status: 'closed',
            actualCloseAt: new Date(time - 7 * DAY_MS + graceDayGap * DAY_MS),
          });
          // No response for this session

          time = time - 7 * DAY_MS + graceDayGap * DAY_MS + 7 * DAY_MS;

          if (respondsAfter) {
            // Respond in the next session after the grace miss
            const afterSession = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            await repos.session.update(afterSession.id, {
              status: 'closed',
              actualCloseAt: new Date(time),
            });
            await repos.response.upsert({
              memberId: member.id,
              sessionId: afterSession.id,
              questionId: 'q-delivering-value',
              score: 3,
            });
          }

          const streakService = createStreakService({
            sessionRepo: repos.session,
            responseRepo: repos.response,
            availabilityRepo: repos.availability,
            teamMemberRepo: repos.teamMember,
          });

          const result = await streakService.calculate(member.id);

          if (respondsAfter) {
            // Grace period preserved the streak and added one more
            expect(result.current).toBe(streakBefore + 1);
          } else {
            // Grace period preserved but not incremented (miss is the last session)
            expect(result.current).toBe(streakBefore);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('second consecutive miss resets streak to zero', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Streak built before the double miss (1-5)
        fc.integer({ min: 1, max: 5 }),
        async (streakBefore) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Reset Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Reset Member',
          });

          const DAY_MS = 24 * 60 * 60 * 1000;
          let time = new Date('2024-01-01T10:00:00Z').getTime();

          // Build initial streak
          for (let i = 0; i < streakBefore; i++) {
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: new Date(time),
            });
            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId: 'q-delivering-value',
              score: 4,
            });
            time += 7 * DAY_MS;
          }

          // First miss (within grace period, 7 days gap)
          const miss1 = await repos.session.create({
            teamId: team.id,
            status: 'closed',
          });
          await repos.session.update(miss1.id, {
            status: 'closed',
            actualCloseAt: new Date(time),
          });
          time += 7 * DAY_MS;

          // Second consecutive miss — breaks streak
          const miss2 = await repos.session.create({
            teamId: team.id,
            status: 'closed',
          });
          await repos.session.update(miss2.id, {
            status: 'closed',
            actualCloseAt: new Date(time),
          });

          const streakService = createStreakService({
            sessionRepo: repos.session,
            responseRepo: repos.response,
            availabilityRepo: repos.availability,
            teamMemberRepo: repos.teamMember,
          });

          const result = await streakService.calculate(member.id);

          // After two consecutive misses, streak resets to zero
          expect(result.current).toBe(0);
          // Best streak should be the initial streak built
          expect(result.best).toBe(streakBefore);
        },
      ),
      { numRuns: 50 },
    );
  });
});

/**
 * **Validates: Requirements 17.6**
 *
 * Property 23: Cadence change preserves streak
 *
 * For any team member with a non-zero streak, changing their cadence preference
 * from weekly to micro-pulse or vice versa SHALL not modify their current streak
 * count or best streak count.
 */
describe('Property 23: Cadence change preserves streak', () => {
  it('changing cadence preference does not affect streak calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of consecutive responses (streak length, 1-10)
        fc.integer({ min: 1, max: 10 }),
        // Initial cadence
        fc.constantFrom('weekly', 'micro_pulse'),
        // New cadence (opposite)
        fc.constantFrom('weekly', 'micro_pulse'),
        async (streakLength, initialCadence, newCadence) => {
          // Only test when cadence actually changes
          if (initialCadence === newCadence) return;

          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Cadence Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Cadence Member',
          });

          // Set initial cadence
          await repos.teamMember.update(member.id, {
            cadencePreference: initialCadence,
          });

          const DAY_MS = 24 * 60 * 60 * 1000;
          let time = new Date('2024-01-01T10:00:00Z').getTime();

          // Build a streak
          for (let i = 0; i < streakLength; i++) {
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: new Date(time),
            });
            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId: 'q-delivering-value',
              score: 3,
            });
            time += 7 * DAY_MS;
          }

          const streakService = createStreakService({
            sessionRepo: repos.session,
            responseRepo: repos.response,
            availabilityRepo: repos.availability,
            teamMemberRepo: repos.teamMember,
          });

          // Calculate streak before cadence change
          const before = await streakService.calculate(member.id);

          // Change cadence preference
          await repos.teamMember.update(member.id, {
            cadencePreference: newCadence,
          });

          // Calculate streak after cadence change
          const after = await streakService.calculate(member.id);

          // Streak must be preserved
          expect(after.current).toBe(before.current);
          expect(after.best).toBe(before.best);
          // Verify streak is actually non-zero
          expect(after.current).toBe(streakLength);
        },
      ),
      { numRuns: 50 },
    );
  });
});

/**
 * Helper: manually calculate expected streak from a sequence of session statuses
 * using the same rules as the streak service.
 */
function calculateExpectedStreak(
  statuses: string[],
  gaps: number[],
  dayMs: number,
): { current: number; best: number } {
  const GRACE_PERIOD_DAYS = 14;

  let currentStreak = 0;
  let bestStreak = 0;
  let lastMissWasGraced = false;
  let graceAvailable = true;
  let previousSessionTime: number | null = null;

  // Compute session close times
  let cumulativeTime = new Date('2024-01-01T10:00:00Z').getTime();
  const sessionTimes: number[] = [];
  for (let i = 0; i < statuses.length; i++) {
    sessionTimes.push(cumulativeTime);
    const gap = gaps[Math.min(i, gaps.length - 1)];
    cumulativeTime += gap * dayMs;
  }

  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];

    if (status === 'away') {
      // Away: skip entirely
      previousSessionTime = sessionTimes[i];
      continue;
    }

    if (status === 'responded') {
      currentStreak++;
      lastMissWasGraced = false;
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak;
      }
    } else {
      // missed
      if (lastMissWasGraced) {
        // Second consecutive miss: break streak
        currentStreak = 0;
        lastMissWasGraced = false;
        graceAvailable = true;
      } else if (graceAvailable && previousSessionTime !== null) {
        // Check grace period
        const daysBetween = (sessionTimes[i] - previousSessionTime) / dayMs;
        if (daysBetween <= GRACE_PERIOD_DAYS) {
          lastMissWasGraced = true;
          graceAvailable = false;
        } else {
          currentStreak = 0;
          lastMissWasGraced = false;
        }
      } else {
        // No grace or no previous session
        currentStreak = 0;
        lastMissWasGraced = false;
      }
    }

    previousSessionTime = sessionTimes[i];
  }

  return { current: currentStreak, best: bestStreak };
}
