import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createSessionService } from '@/lib/services/session.service';

/**
 * Arbitrary for generating a list of valid scores (1-5) representing
 * responses from different members for a single question in a session.
 */
const scoresArb = fc.array(fc.integer({ min: 1, max: 5 }), {
  minLength: 1,
  maxLength: 30,
});

/**
 * Arbitrary for trend indicators to attach to responses.
 */
const trendArb = fc.constantFrom('improving', 'stable', 'declining');

describe('Session Aggregate Properties', () => {
  /**
   * **Validates: Requirements 8.1**
   *
   * Property 16: Session average computation correctness
   *
   * For any set of N (1-30) scores in the range [1,5], when responses are
   * created for a single question in a session and aggregates are materialised,
   * the stored averageScore SHALL equal the arithmetic mean rounded to 1 decimal
   * place, and the responseCount SHALL equal N.
   */
  describe('Property 16: Session average computation correctness', () => {
    it('materialised average equals arithmetic mean rounded to 1 decimal place', async () => {
      await fc.assert(
        fc.asyncProperty(scoresArb, trendArb, async (scores, trend) => {
          const repos = createInMemoryRepositories();
          const sessionService = createSessionService({
            sessionRepo: repos.session,
            sessionLinkRepo: repos.sessionLink,
            teamMemberRepo: repos.teamMember,
            responseRepo: repos.response,
            sessionAggregateRepo: repos.sessionAggregate,
          });

          const teamId = 'team-agg-test';
          const questionId = 'q-delivering-value';

          // Create a session directly in the repo
          const session = await repos.session.create({
            teamId,
            status: 'closed',
          });

          // Create N responses with the generated scores, each from a different member
          for (let i = 0; i < scores.length; i++) {
            await repos.response.upsert({
              memberId: `member-${i}`,
              sessionId: session.id,
              questionId,
              score: scores[i],
              trendIndicator: trend,
            });
          }

          // Materialise aggregates
          await sessionService.materializeAggregates(session.id);

          // Retrieve stored aggregates
          const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
          expect(aggregates).toHaveLength(1);

          const aggregate = aggregates[0];

          // Compute expected average: arithmetic mean rounded to 1 decimal place
          const sum = scores.reduce((acc, s) => acc + s, 0);
          const expectedAverage = Math.round((sum / scores.length) * 10) / 10;

          expect(aggregate.averageScore).toBe(expectedAverage);
          expect(aggregate.responseCount).toBe(scores.length);
        }),
        { numRuns: 100 }
      );
    });
  });
});
