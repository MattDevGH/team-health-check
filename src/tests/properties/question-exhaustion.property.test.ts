import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createQuestionSelectionService } from '@/lib/services/question-selection.service';

const ALL_QUESTION_IDS = [
  'q-delivering-value',
  'q-team-collaboration',
  'q-ease-of-delivery',
  'q-learning-improving',
  'q-psychological-safety',
];

/**
 * **Validates: Requirements 15.5, 15.6**
 *
 * Property 32: Micro-pulse question exhaustion guarantee
 *
 * For any micro-pulse member participating in a session lasting N days (5-10),
 * calling selectForMember each day with decreasing remainingDays and answering
 * the returned questions SHALL result in all 5 fixed questions being delivered
 * exactly once over the session — no duplicates and no missed questions.
 */
describe('Property 32: Micro-pulse question exhaustion guarantee', () => {
  it('all 5 questions are delivered exactly once over a full session', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Session duration in days (5-10)
        fc.integer({ min: 5, max: 10 }),
        async (sessionDays) => {
          const repos = createInMemoryRepositories();

          // Set up team and member
          const team = await repos.team.create({
            name: 'Micro-Pulse Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Pulse Member',
          });

          // Create an open session
          const session = await repos.session.create({
            teamId: team.id,
            status: 'open',
          });

          const service = createQuestionSelectionService({
            questionRepo: repos.question,
            responseRepo: repos.response,
            sessionRepo: repos.session,
          });

          const allDelivered: string[] = [];

          // Simulate each day of the session (day N, N-1, ..., 1)
          for (let remainingDays = sessionDays; remainingDays >= 1; remainingDays--) {
            const questions = await service.selectForMember(
              member.id,
              session.id,
              remainingDays,
            );

            // If no questions returned, all have been answered
            if (questions.length === 0) break;

            // Record delivered questions
            allDelivered.push(...questions);

            // "Answer" the returned questions by upserting responses
            for (const questionId of questions) {
              await repos.response.upsert({
                memberId: member.id,
                sessionId: session.id,
                questionId,
                score: 3,
              });
            }
          }

          // All 5 questions must have been delivered
          const deliveredSet = new Set(allDelivered);
          expect(deliveredSet.size).toBe(5);
          for (const qId of ALL_QUESTION_IDS) {
            expect(deliveredSet.has(qId)).toBe(true);
          }

          // Each question delivered exactly once (no duplicates)
          expect(allDelivered.length).toBe(5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no question is delivered more than once even with varying session lengths', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Session duration in days (5-10)
        fc.integer({ min: 5, max: 10 }),
        async (sessionDays) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'No-Dup Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'No-Dup Member',
          });

          const session = await repos.session.create({
            teamId: team.id,
            status: 'open',
          });

          const service = createQuestionSelectionService({
            questionRepo: repos.question,
            responseRepo: repos.response,
            sessionRepo: repos.session,
          });

          const deliveryCounts = new Map<string, number>();

          for (let remainingDays = sessionDays; remainingDays >= 1; remainingDays--) {
            const questions = await service.selectForMember(
              member.id,
              session.id,
              remainingDays,
            );

            if (questions.length === 0) break;

            for (const questionId of questions) {
              deliveryCounts.set(
                questionId,
                (deliveryCounts.get(questionId) ?? 0) + 1,
              );

              // Answer immediately
              await repos.response.upsert({
                memberId: member.id,
                sessionId: session.id,
                questionId,
                score: 4,
              });
            }
          }

          // Every delivered question must appear exactly once
          for (const [, count] of deliveryCounts) {
            expect(count).toBe(1);
          }

          // All 5 must have been delivered
          expect(deliveryCounts.size).toBe(5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
