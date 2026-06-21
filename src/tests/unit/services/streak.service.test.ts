/**
 * Unit tests for StreakService.calculate
 * Requirements: 17.1, 17.3, 17.4, 17.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createStreakService } from '@/lib/services/streak.service';

describe('StreakService.calculate', () => {
  let repos: Repositories;
  let streakService: ReturnType<typeof createStreakService>;

  const TEAM_ID = 'team-1';
  const MEMBER_ID = 'member-1';

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    streakService = createStreakService({
      sessionRepo: repos.session,
      responseRepo: repos.response,
      availabilityRepo: repos.availability,
      teamMemberRepo: repos.teamMember,
    });

    // Seed: team member belongs to team-1
    await repos.teamMember.create({ id: MEMBER_ID, teamId: TEAM_ID, name: 'Alice' });
  });

  /**
   * Helper to create a closed session with a specific close date.
   */
  async function createClosedSession(closeDate: Date): Promise<string> {
    const session = await repos.session.create({ teamId: TEAM_ID, status: 'closed' });
    await repos.session.update(session.id, { actualCloseAt: closeDate });
    return session.id;
  }

  /**
   * Helper to add a response for the member in a given session.
   */
  async function addResponse(sessionId: string): Promise<void> {
    await repos.response.upsert({
      memberId: MEMBER_ID,
      sessionId,
      questionId: 'q-delivering-value',
      score: 4,
    });
  }

  it('returns { current: 0, best: 0 } when no sessions exist', async () => {
    const result = await streakService.calculate(MEMBER_ID);
    expect(result).toEqual({ current: 0, best: 0 });
  });

  it('consecutive participation increments streak', async () => {
    // Create 3 closed sessions, each 7 days apart
    const now = new Date();
    const s1 = await createClosedSession(new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000));
    const s2 = await createClosedSession(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000));
    const s3 = await createClosedSession(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

    // Member responded to all 3
    await addResponse(s1);
    await addResponse(s2);
    await addResponse(s3);

    const result = await streakService.calculate(MEMBER_ID);
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('away sessions are excluded (do not break or count toward streak)', async () => {
    // 3 sessions, member was away during the middle one
    const now = new Date();
    const closeDate1 = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const closeDate2 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const closeDate3 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const s1 = await createClosedSession(closeDate1);
    const s2 = await createClosedSession(closeDate2);
    const s3 = await createClosedSession(closeDate3);

    // Member responded to sessions 1 and 3, but was away for session 2
    await addResponse(s1);
    await addResponse(s3);

    // Mark member as away during session 2's close date
    await repos.availability.create({
      memberId: MEMBER_ID,
      awayFrom: new Date(closeDate2.getTime() - 1 * 24 * 60 * 60 * 1000),
      awayUntil: new Date(closeDate2.getTime() + 1 * 24 * 60 * 60 * 1000),
    });

    const result = await streakService.calculate(MEMBER_ID);
    // Away session is skipped; streak counts s1 and s3 = 2
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it('one missed session within grace period (14 days) does not break streak', async () => {
    const now = new Date();
    // 3 sessions within 14 days of each other
    const closeDate1 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const closeDate2 = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000); // 7 days after s1
    const closeDate3 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);  // 7 days after s2

    const s1 = await createClosedSession(closeDate1);
    const s2 = await createClosedSession(closeDate2);
    const s3 = await createClosedSession(closeDate3);

    // Member responded to s1 and s3, missed s2 (not away, just didn't respond)
    await addResponse(s1);
    await addResponse(s3);
    // No availability record for s2 — this is a genuine miss

    const result = await streakService.calculate(MEMBER_ID);
    // Grace period applied: one miss is forgiven (s2 is within 14 days of s1)
    // Streak counts responded sessions only but isn't broken: s1 + s3 = 2
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it('two consecutive misses reset streak to 0', async () => {
    const now = new Date();
    const closeDate1 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const closeDate2 = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const closeDate3 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const closeDate4 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const s1 = await createClosedSession(closeDate1);
    const s2 = await createClosedSession(closeDate2);
    const s3 = await createClosedSession(closeDate3);
    const s4 = await createClosedSession(closeDate4);

    // Member responded to s1, then missed s2 and s3 (two consecutive), then responded to s4
    await addResponse(s1);
    await addResponse(s4);
    // No responses for s2 and s3, no away status

    const result = await streakService.calculate(MEMBER_ID);
    // Two consecutive misses reset the streak. Current streak starts from s4 = 1
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('best streak is tracked across resets', async () => {
    const now = new Date();
    // 6 sessions: 4 responded, then 2 missed, then 1 responded
    const closeDate1 = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);
    const closeDate2 = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const closeDate3 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const closeDate4 = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const closeDate5 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const closeDate6 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const s1 = await createClosedSession(closeDate1);
    const s2 = await createClosedSession(closeDate2);
    const s3 = await createClosedSession(closeDate3);
    const s4 = await createClosedSession(closeDate4);
    const s5 = await createClosedSession(closeDate5);
    const s6 = await createClosedSession(closeDate6);

    // First 3 sessions responded, then 2 missed, then 1 responded
    await addResponse(s1);
    await addResponse(s2);
    await addResponse(s3);
    // s4 and s5 missed (two consecutive) → resets streak
    await addResponse(s6);

    const result = await streakService.calculate(MEMBER_ID);
    // Best streak was 3 (s1, s2, s3). Current streak is 1 (s6)
    expect(result.current).toBe(1);
    expect(result.best).toBe(3);
  });
});
