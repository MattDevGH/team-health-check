import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createResponseService } from '@/lib/services/response.service';

/**
 * **Validates: Requirements 10.2, 10.3, 4.8**
 *
 * Property 12: Response upsert — exactly one record per (member, question, session)
 *
 * Generate N submissions for same (member, question, session) with varying scores;
 * verify exactly one record with latest score.
 */
describe('Property 12: Response upsert — exactly one record per (member, question, session)', () => {
  it('N upserts for same (member, session, question) result in exactly one record with the last score', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 20 }),
        async (scores) => {
          const repos = createInMemoryRepositories();

          // Set up a team, member, and open session
          const team = await repos.team.create({
            name: 'Test Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const member = await repos.teamMember.create({
            teamId: team.id,
            name: 'Test Member',
          });

          const session = await repos.session.create({
            teamId: team.id,
            status: 'open',
          });

          const questionId = 'q-delivering-value';

          const responseService = createResponseService({
            responseRepo: repos.response,
            sessionRepo: repos.session,
            teamMemberRepo: repos.teamMember,
          });

          // Submit N responses sequentially with different scores
          for (const score of scores) {
            await responseService.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId,
              score,
            });
          }

          // Verify exactly 1 response record exists for this (member, session, question)
          const responses = await repos.response.findByMemberAndSession(
            member.id,
            session.id,
          );
          const matchingResponses = responses.filter(
            (r) => r.questionId === questionId,
          );

          expect(matchingResponses).toHaveLength(1);

          // Verify the stored score equals the last submitted score
          const lastScore = scores[scores.length - 1];
          expect(matchingResponses[0].score).toBe(lastScore);
        }
      )
    );
  });
});
