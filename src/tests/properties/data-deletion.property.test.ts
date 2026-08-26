import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createResponseService } from '@/lib/services/response.service';
import { createSessionService } from '@/lib/services/session.service';

/**
 * Arbitrary for number of members (3-10) in a session.
 */
const memberCountArb = fc.integer({ min: 3, max: 10 });

/**
 * Arbitrary for valid scores (1-5).
 */
const scoreArb = fc.integer({ min: 1, max: 5 });

/**
 * Arbitrary for trend indicators.
 */
const trendArb = fc.constantFrom('improving', 'stable', 'declining');

/**
 * Arbitrary for number of questions a member responds to (1-5).
 */
const questionCountArb = fc.integer({ min: 1, max: 5 });

const QUESTION_IDS = [
  'q-delivering-value',
  'q-team-collaboration',
  'q-ease-of-delivery',
  'q-learning-improving',
  'q-psychological-safety',
];

describe('Data Deletion Properties', () => {
  /**
   * **Validates: Requirements NFR 4.5, NFR 4.6**
   *
   * Property 28: Data deletion preserves materialised aggregates
   *
   * For any team member who requests data deletion, all their individual
   * response records SHALL be removed from the database, but all previously
   * materialised session aggregates SHALL remain unchanged in value.
   */
  describe('Property 28: Data deletion preserves materialised aggregates', () => {
    it('aggregates remain unchanged after member data deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          fc.array(scoreArb, { minLength: 3, maxLength: 10 }),
          trendArb,
          async (memberCount, scores, trend) => {
            const repos = createInMemoryRepositories();
            const sessionService = createSessionService({
              sessionRepo: repos.session,
              sessionLinkRepo: repos.sessionLink,
              teamMemberRepo: repos.teamMember,
              responseRepo: repos.response,
              sessionAggregateRepo: repos.sessionAggregate,
            });
            const responseService = createResponseService({
              responseRepo: repos.response,
              sessionRepo: repos.session,
              teamMemberRepo: repos.teamMember,
              auditLogRepo: repos.auditLog,
            });

            const teamId = 'team-deletion-test';

            // Create a closed session
            const session = await repos.session.create({
              teamId,
              status: 'closed',
            });

            // Create members and submit responses for a single question
            const actualMemberCount = Math.min(memberCount, scores.length);
            const memberIds: string[] = [];

            for (let i = 0; i < actualMemberCount; i++) {
              const memberId = `member-del-${i}`;
              memberIds.push(memberId);
              await repos.teamMember.create({
                id: memberId,
                teamId,
                name: `Member ${i}`,
              });
              await repos.response.upsert({
                memberId,
                sessionId: session.id,
                questionId: QUESTION_IDS[0],
                score: scores[i % scores.length],
                trendIndicator: trend,
              });
            }

            // Materialise aggregates
            await sessionService.materializeAggregates(session.id);

            // Record original aggregate values
            const aggregatesBefore = await repos.sessionAggregate.findBySessionId(session.id);
            const originalValues = aggregatesBefore.map(a => ({
              questionId: a.questionId,
              averageScore: a.averageScore,
              responseCount: a.responseCount,
              improvingCount: a.improvingCount,
              stableCount: a.stableCount,
              decliningCount: a.decliningCount,
            }));

            // Delete one member's data
            const memberToDelete = memberIds[0];
            await responseService.deleteMyData(memberToDelete);

            // Verify aggregates are UNCHANGED
            const aggregatesAfter = await repos.sessionAggregate.findBySessionId(session.id);
            const afterValues = aggregatesAfter.map(a => ({
              questionId: a.questionId,
              averageScore: a.averageScore,
              responseCount: a.responseCount,
              improvingCount: a.improvingCount,
              stableCount: a.stableCount,
              decliningCount: a.decliningCount,
            }));

            expect(afterValues).toEqual(originalValues);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Validates: Requirements NFR 4.5, NFR 4.6**
   *
   * Property 33: Live participation decrement on mid-session data deletion
   *
   * For any active HealthCheckSession with a live participation count of C,
   * if a participating TeamMember executes data deletion during that session,
   * the live participation count SHALL immediately evaluate to C - 1.
   */
  describe('Property 33: Live participation decrement on mid-session data deletion', () => {
    it('response count decreases by deleted member response count after deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          questionCountArb,
          scoreArb,
          trendArb,
          async (memberCount, questionCount, score, trend) => {
            const repos = createInMemoryRepositories();
            const responseService = createResponseService({
              responseRepo: repos.response,
              sessionRepo: repos.session,
              teamMemberRepo: repos.teamMember,
              auditLogRepo: repos.auditLog,
            });

            const teamId = 'team-live-del-test';

            // Create an OPEN session
            const session = await repos.session.create({
              teamId,
              status: 'open',
            });

            // Create members and have them submit responses
            const memberIds: string[] = [];
            const questionsToUse = QUESTION_IDS.slice(0, questionCount);

            for (let i = 0; i < memberCount; i++) {
              const memberId = `member-live-${i}`;
              memberIds.push(memberId);
              await repos.teamMember.create({
                id: memberId,
                teamId,
                name: `Member ${i}`,
              });
              // Each member answers all selected questions
              for (const questionId of questionsToUse) {
                await repos.response.upsert({
                  memberId,
                  sessionId: session.id,
                  questionId,
                  score,
                  trendIndicator: trend,
                });
              }
            }

            // Count responses before deletion
            const responsesBefore = await repos.response.findBySession(session.id);
            const countBefore = responsesBefore.length;

            // Pick a member to delete
            const memberToDelete = memberIds[0];
            const memberResponsesBefore = responsesBefore.filter(
              r => r.memberId === memberToDelete,
            );
            const memberResponseCount = memberResponsesBefore.length;

            // Delete that member's data
            await responseService.deleteMyData(memberToDelete);

            // Count responses after deletion
            const responsesAfter = await repos.response.findBySession(session.id);
            const countAfter = responsesAfter.length;

            // Verify count decreased by member's response count
            expect(countAfter).toBe(countBefore - memberResponseCount);

            // Verify no responses from deleted member remain
            const deletedMemberResponses = responsesAfter.filter(
              r => r.memberId === memberToDelete,
            );
            expect(deletedMemberResponses).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
