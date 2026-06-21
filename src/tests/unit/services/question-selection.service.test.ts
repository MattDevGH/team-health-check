/**
 * Unit tests for question-selection.service.ts
 * Requirements: 15.3, 15.4, 15.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createQuestionSelectionService } from '@/lib/services/question-selection.service';

describe('QuestionSelectionService.selectForMember', () => {
  let repos: Repositories;
  let service: ReturnType<typeof createQuestionSelectionService>;

  let teamId: string;
  let memberId: string;
  let sessionId: string;

  const QUESTION_IDS = [
    'q-delivering-value',
    'q-team-collaboration',
    'q-ease-of-delivery',
    'q-learning-improving',
    'q-psychological-safety',
  ];

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    service = createQuestionSelectionService({
      questionRepo: repos.question,
      responseRepo: repos.response,
      sessionRepo: repos.session,
    });

    // Seed: team, member, and open session
    const team = await repos.team.create({ name: 'Team Alpha' });
    teamId = team.id;
    const member = await repos.teamMember.create({ id: 'member-1', teamId, name: 'Alice' });
    memberId = member.id;
    const session = await repos.session.create({ teamId, status: 'open' });
    sessionId = session.id;
  });

  it('returns empty array when all questions are answered', async () => {
    for (const qId of QUESTION_IDS) {
      await repos.response.upsert({
        memberId,
        sessionId,
        questionId: qId,
        score: 4,
      });
    }

    const result = await service.selectForMember(memberId, sessionId, 5);
    expect(result).toEqual([]);
  });

  it('selects unanswered questions over answered ones', async () => {
    await repos.response.upsert({ memberId, sessionId, questionId: QUESTION_IDS[0], score: 3 });
    await repos.response.upsert({ memberId, sessionId, questionId: QUESTION_IDS[1], score: 4 });
    await repos.response.upsert({ memberId, sessionId, questionId: QUESTION_IDS[2], score: 5 });

    const result = await service.selectForMember(memberId, sessionId, 5);

    // Should only return from the 2 unanswered questions
    expect(result.length).toBeGreaterThan(0);
    for (const qId of result) {
      expect([QUESTION_IDS[3], QUESTION_IDS[4]]).toContain(qId);
    }
  });

  it('returns 1 question when remaining days >= unanswered count', async () => {
    const result = await service.selectForMember(memberId, sessionId, 5);
    expect(result).toHaveLength(1);
    expect(QUESTION_IDS).toContain(result[0]);
  });

  it('bundles multiple questions when remaining days < unanswered count', async () => {
    // 5 unanswered, only 2 days remaining → ceil(5/2) = 3 questions
    const result = await service.selectForMember(memberId, sessionId, 2);

    expect(result.length).toBeGreaterThan(1);
    for (const qId of result) {
      expect(QUESTION_IDS).toContain(qId);
    }
  });

  it('bundles correctly with 1 day remaining', async () => {
    // 1 day remaining, 3 unanswered → should send all 3
    await repos.response.upsert({ memberId, sessionId, questionId: QUESTION_IDS[0], score: 3 });
    await repos.response.upsert({ memberId, sessionId, questionId: QUESTION_IDS[1], score: 4 });

    const result = await service.selectForMember(memberId, sessionId, 1);

    // With 1 day remaining, all 3 unanswered should be bundled
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual([QUESTION_IDS[2], QUESTION_IDS[3], QUESTION_IDS[4]].sort());
  });

  it('covers all 5 questions within a session when called repeatedly', async () => {
    const selectedSet = new Set<string>();

    // Simulate micro-pulse: select question, "answer" it, select next
    for (let day = 0; day < 10; day++) {
      const remainingDays = 10 - day;
      const result = await service.selectForMember(memberId, sessionId, remainingDays);
      if (result.length === 0) break;

      for (const qId of result) {
        selectedSet.add(qId);
        await repos.response.upsert({
          memberId,
          sessionId,
          questionId: qId,
          score: 3,
        });
      }
    }

    // All 5 questions should have been selected eventually
    expect(selectedSet.size).toBe(5);
    for (const qId of QUESTION_IDS) {
      expect(selectedSet).toContain(qId);
    }
  });

  it('weights favour questions with longer gaps since last response', async () => {
    // Create a previous closed session for the same team
    const prevSession = await repos.session.create({ teamId, status: 'closed' });

    // q-delivering-value answered recently (in prev session)
    await repos.response.upsert({
      memberId,
      sessionId: prevSession.id,
      questionId: QUESTION_IDS[0],
      score: 3,
    });

    // q-team-collaboration answered in prev session too
    await repos.response.upsert({
      memberId,
      sessionId: prevSession.id,
      questionId: QUESTION_IDS[1],
      score: 4,
    });

    // q-ease-of-delivery, q-learning-improving, q-psychological-safety NEVER answered
    // → should have maximum weight

    // Run selection many times to verify statistical preference
    const selectionCounts = new Map<string, number>();
    for (const qId of QUESTION_IDS) {
      selectionCounts.set(qId, 0);
    }

    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      const result = await service.selectForMember(memberId, sessionId, 5);
      for (const qId of result) {
        selectionCounts.set(qId, (selectionCounts.get(qId) ?? 0) + 1);
      }
    }

    // Questions never answered (q-ease-of-delivery, q-learning-improving, q-psychological-safety)
    // should have higher selection rates than recently answered ones
    const neverAnsweredCount =
      (selectionCounts.get(QUESTION_IDS[2]) ?? 0) +
      (selectionCounts.get(QUESTION_IDS[3]) ?? 0) +
      (selectionCounts.get(QUESTION_IDS[4]) ?? 0);

    const recentlyAnsweredCount =
      (selectionCounts.get(QUESTION_IDS[0]) ?? 0) +
      (selectionCounts.get(QUESTION_IDS[1]) ?? 0);

    // Never-answered questions (3 of them) should collectively be selected more often
    // than recently-answered ones (2 of them) with the weighting
    expect(neverAnsweredCount).toBeGreaterThan(recentlyAnsweredCount);
  });
});
