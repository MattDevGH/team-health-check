import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTrendService } from '@/lib/services/trend.service';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/**
 * Arbitrary for generating session response counts in the range 0-5.
 * This covers: 0 (omitted entirely), 1-2 (below threshold, suppressed), 3-5 (shown).
 */
const responseCountsArb = fc.array(fc.integer({ min: 0, max: 5 }), {
  minLength: 1,
  maxLength: 10,
});

describe('Trend Suppression Properties', () => {
  /**
   * **Validates: Requirements 8.6, 8.7**
   *
   * Property 17: Data suppression for insufficient responses in anonymous mode
   *
   * For any question within a closed session belonging to a team in anonymous
   * privacy mode, if the response count is fewer than the configured threshold
   * (default 3), the trend dashboard SHALL suppress the average and display
   * "insufficient data" instead. If a question has zero responses, that data
   * point SHALL be omitted entirely.
   */
  describe('Property 17: Data suppression for insufficient responses in anonymous mode', () => {
    it('sessions with 0 responses are omitted; 1-2 responses are suppressed; ≥3 show actual average', async () => {
      await fc.assert(
        fc.asyncProperty(responseCountsArb, async (responseCounts) => {
          const repos = createInMemoryRepositories();

          // Create a team in anonymous privacy mode
          const team = await repos.team.create({
            name: 'Anonymous Team',
            privacyMode: 'anonymous',
          });

          const questionId = 'q-delivering-value';
          const sessionIds: string[] = [];

          // Create sessions with varying response counts and materialised aggregates
          for (let i = 0; i < responseCounts.length; i++) {
            const count = responseCounts[i];
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });
            sessionIds.push(session.id);

            // Register session-team mapping for aggregate lookups
            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            // Only create an aggregate if responseCount > 0
            // (sessions with 0 responses have no aggregate at all)
            if (count > 0) {
              await repos.sessionAggregate.create({
                sessionId: session.id,
                questionId,
                averageScore: 3.5, // arbitrary score
                responseCount: count,
                improvingCount: 0,
                stableCount: count,
                decliningCount: 0,
              });
            }
          }

          // Create TrendService and get averages
          const trendService = createTrendService({
            sessionAggregateRepo: repos.sessionAggregate,
            sessionRepo: repos.session,
            teamRepo: repos.team,
          });

          const results = await trendService.getSessionAverages(team.id, questionId);

          // Verify each session's handling based on response count
          for (let i = 0; i < responseCounts.length; i++) {
            const count = responseCounts[i];
            const sessionId = sessionIds[i];
            const result = results.find(r => r.sessionId === sessionId);

            if (count === 0) {
              // Sessions with 0 responses should be omitted entirely
              expect(result).toBeUndefined();
            } else if (count < 3) {
              // Sessions with 1-2 responses (below threshold) should be suppressed
              expect(result).toBeDefined();
              expect(result!.suppressed).toBe(true);
              expect(result!.averageScore).toBeNull();
            } else {
              // Sessions with ≥3 responses should show actual average
              expect(result).toBeDefined();
              expect(result!.suppressed).toBeUndefined();
              expect(result!.averageScore).toBe(3.5);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
