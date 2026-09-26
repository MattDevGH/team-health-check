/**
 * Answers a member has finished with, and what the rolling average counts.
 *
 * Requirements: 16.1, 16.2, 18.1, 18.2, 18.3, 18.4, 4.8
 *
 * The rolling average used to be computed over live rows and handed back to
 * the member who had just written one. Because an answer could be changed
 * until the session closed, a member could read the average, change their own
 * score, and read it again — and two readings give the window size and the sum
 * of everybody else's answers. At the five-response minimum the mean moves in
 * steps of 0.2, which one decimal place represents exactly, so rounding hid
 * nothing.
 *
 * These assert the outcome a member could observe, not which repository method
 * was called: that the number does not move when they change their own answer,
 * and that it does start counting them once they say they are done.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createContainer, type Container } from '@/lib/container';

const QUESTION = 'q-delivering-value';

describe('a live answer does not count towards the rolling average', () => {
  let repos: Repositories;
  let container: Container;
  let teamId = '';
  let sessionId = '';
  let memberIds: string[] = [];

  /** A team of six, so five colleagues can finalise before the sixth answers. */
  beforeEach(async () => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);

    const team = await container.team.create('Differencing Team', '', 'creator-1');
    teamId = team.id;

    memberIds = [];
    for (const name of ['Alice', 'Bea', 'Cass', 'Dev', 'Eve', 'Fin']) {
      const member = await container.team.addMember(
        team.id,
        name,
        `${name.toLowerCase()}@example.invalid`,
        'creator-1',
      );
      memberIds.push(member.id);
    }

    const session = await container.session.open(team.id, 'creator-1');
    sessionId = session.id;
  });

  /** Everyone but the last member answers and marks themselves done. */
  async function fiveColleaguesFinalise(scores: number[]): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
      await container.response.upsert({
        memberId: memberIds[index]!,
        sessionId,
        questionId: QUESTION,
        score: scores[index]!,
      });
      await container.response.finalise({ memberId: memberIds[index]!, sessionId });
    }
  }

  it('ignores an answer its author can still change', async () => {
    await fiveColleaguesFinalise([3, 3, 3, 3, 3]);

    // The sixth member answers, but has not said they are done
    await container.response.upsert({
      memberId: memberIds[5]!,
      sessionId,
      questionId: QUESTION,
      score: 5,
    });

    // Five finalised threes. The live 5 must not drag it up
    expect(await container.response.getRollingAverage(teamId, QUESTION)).toBe(3);
  });

  /**
   * Requirement 16.1, stated as the thing an attacker would try.
   *
   * Against the old behaviour the member reads 3.3, changes their answer, and
   * reads 3.7 — a move of 0.4 for a change of 2, which gives a window of 5 and
   * the sum of the other four.
   */
  it('does not move when a member changes their own answer', async () => {
    await fiveColleaguesFinalise([3, 3, 3, 3, 3]);

    await container.response.upsert({
      memberId: memberIds[5]!,
      sessionId,
      questionId: QUESTION,
      score: 1,
    });
    const first = await container.response.getRollingAverage(teamId, QUESTION);

    await container.response.upsert({
      memberId: memberIds[5]!,
      sessionId,
      questionId: QUESTION,
      score: 5,
    });
    const second = await container.response.getRollingAverage(teamId, QUESTION);

    expect(second).toBe(first);
  });

  it('counts the answer once its author marks it final', async () => {
    await fiveColleaguesFinalise([3, 3, 3, 3, 3]);

    await container.response.upsert({
      memberId: memberIds[5]!,
      sessionId,
      questionId: QUESTION,
      score: 5,
    });
    expect(await container.response.getRollingAverage(teamId, QUESTION)).toBe(3);

    await container.response.finalise({ memberId: memberIds[5]!, sessionId });

    // (3+3+3+3+3+5) / 6 = 3.333… → 3.3
    expect(await container.response.getRollingAverage(teamId, QUESTION)).toBe(3.3);
  });

  it('says more responses are needed while too few are final', async () => {
    // Four finalised and one live is four final responses, below the minimum
    for (let index = 0; index < 4; index += 1) {
      await container.response.upsert({
        memberId: memberIds[index]!,
        sessionId,
        questionId: QUESTION,
        score: 4,
      });
      await container.response.finalise({ memberId: memberIds[index]!, sessionId });
    }
    await container.response.upsert({
      memberId: memberIds[4]!,
      sessionId,
      questionId: QUESTION,
      score: 4,
    });

    expect(await container.response.getRollingAverage(teamId, QUESTION)).toBeNull();
  });
});

describe('marking answers final', () => {
  let repos: Repositories;
  let container: Container;
  let memberId = '';
  let otherId = '';
  let sessionId = '';

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);

    const team = await container.team.create('Finalising Team', '', 'creator-1');
    const member = await container.team.addMember(team.id, 'Alice', 'alice@example.invalid', 'creator-1');
    const other = await container.team.addMember(team.id, 'Bea', 'bea@example.invalid', 'creator-1');
    memberId = member.id;
    otherId = other.id;

    const session = await container.session.open(team.id, 'creator-1');
    sessionId = session.id;
  });

  /** Requirement 18.2 */
  it('covers every answer the member gave in that session', async () => {
    for (const questionId of ['q-delivering-value', 'q-team-collaboration', 'q-ease-of-delivery']) {
      await container.response.upsert({ memberId, sessionId, questionId, score: 4 });
    }

    await container.response.finalise({ memberId, sessionId });

    const mine = await repos.response.findByMemberAndSession(memberId, sessionId);
    expect(mine).toHaveLength(3);
    expect(mine.every(response => response.finalisedAt !== null)).toBe(true);
  });

  /** Requirement 18.2 — one member saying they are done says nothing about another. */
  it('leaves another member’s answers alone', async () => {
    await container.response.upsert({ memberId, sessionId, questionId: QUESTION, score: 4 });
    await container.response.upsert({ memberId: otherId, sessionId, questionId: QUESTION, score: 2 });

    await container.response.finalise({ memberId, sessionId });

    const theirs = await repos.response.findByMemberAndSession(otherId, sessionId);
    expect(theirs[0]?.finalisedAt).toBeNull();
  });

  /** Requirement 18.3 */
  it('refuses a later change, and says why', async () => {
    await container.response.upsert({ memberId, sessionId, questionId: QUESTION, score: 4 });
    await container.response.finalise({ memberId, sessionId });

    await expect(
      container.response.upsert({ memberId, sessionId, questionId: QUESTION, score: 1 }),
    ).rejects.toThrow(/final/i);

    // And the stored answer is the one they finished with
    const mine = await repos.response.findByMemberAndSession(memberId, sessionId);
    expect(mine[0]?.score).toBe(4);
  });

  it('refuses a new answer to a question they had not answered', async () => {
    await container.response.upsert({ memberId, sessionId, questionId: QUESTION, score: 4 });
    await container.response.finalise({ memberId, sessionId });

    await expect(
      container.response.upsert({
        memberId,
        sessionId,
        questionId: 'q-team-collaboration',
        score: 3,
      }),
    ).rejects.toThrow(/final/i);
  });

  it('refuses to finalise when the member has answered nothing', async () => {
    // Nothing to finish with, and a member who has not taken part should not
    // be recorded as though they had
    await expect(container.response.finalise({ memberId, sessionId })).rejects.toThrow();
  });

  it('is idempotent, because a second click is a second click', async () => {
    await container.response.upsert({ memberId, sessionId, questionId: QUESTION, score: 4 });
    const first = await container.response.finalise({ memberId, sessionId });
    const again = await container.response.finalise({ memberId, sessionId });

    const mine = await repos.response.findByMemberAndSession(memberId, sessionId);
    expect(mine[0]?.finalisedAt).toEqual(first.finalisedAt);
    expect(again.finalisedAt).toEqual(first.finalisedAt);
  });
});

/** Requirement 18.4, and 18.7: not marking your answers final must not cost you. */
describe('closing a session', () => {
  it('treats every answer in it as final', async () => {
    const repos = createInMemoryRepositories();
    const container = createContainer(repos);

    const team = await container.team.create('Closing Team', '', 'creator-1');
    const member = await container.team.addMember(team.id, 'Alice', 'a@example.invalid', 'creator-1');
    const session = await container.session.open(team.id, 'creator-1');

    await container.response.upsert({
      memberId: member.id,
      sessionId: session.id,
      questionId: QUESTION,
      score: 4,
    });

    await container.session.close(team.id, session.id, 'creator-1');

    const stored = await repos.response.findBySession(session.id);
    expect(stored[0]?.finalisedAt).not.toBeNull();
  });
});
