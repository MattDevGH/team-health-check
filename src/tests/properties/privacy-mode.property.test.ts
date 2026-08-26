import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTrendService } from '@/lib/services/trend.service';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/**
 * Arbitrary for generating a team with N members (2-10) in anonymous mode.
 * Each member has a unique name and optional email.
 */
const memberCountArb = fc.integer({ min: 2, max: 10 });

/**
 * Arbitrary for generating scores per member (1-5).
 */
const scoreArb = fc.integer({ min: 1, max: 5 });

/**
 * Arbitrary for trend indicators.
 */
const trendArb = fc.constantFrom('improving', 'stable', 'declining');

/**
 * Arbitrary for anonymity threshold (minimum responses needed to show data).
 */
const thresholdArb = fc.integer({ min: 2, max: 5 });

describe('Privacy Mode Properties', () => {
  /**
   * **Validates: Requirements 14.2, 14.3, 20.6**
   *
   * Property 29: Privacy mode prevents individual data exposure
   *
   * For any team in anonymous privacy mode, no API response, dashboard view,
   * or export SHALL expose individual team member scores, trend indicators,
   * or identifiers linked to specific responses. Only aggregated data
   * (averages, distributions, counts) SHALL be accessible.
   */
  describe('Property 29: Privacy mode prevents individual data exposure', () => {
    it('getSessionAverages never exposes individual member IDs or individual scores', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          thresholdArb,
          fc.array(scoreArb, { minLength: 1, maxLength: 10 }),
          async (memberCount, threshold, scores) => {
            const repos = createInMemoryRepositories();

            // Create a team in anonymous privacy mode
            const team = await repos.team.create({
              name: 'Anonymous Team',
              privacyMode: 'anonymous',
            });

            const questionId = 'q-delivering-value';

            // Create a session
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });

            // Register session-team mapping for aggregate lookups
            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            // Create members and their responses
            const memberIds: string[] = [];
            const memberNames: string[] = [];
            const memberEmails: string[] = [];
            const actualResponseCount = Math.min(memberCount, scores.length);

            for (let i = 0; i < memberCount; i++) {
              const member = await repos.teamMember.create({
                teamId: team.id,
                name: `Member ${i}`,
                email: `member${i}@example.com`,
              });
              memberIds.push(member.id);
              memberNames.push(member.name);
              memberEmails.push(member.email!);
            }

            // Submit responses from a subset of members
            for (let i = 0; i < actualResponseCount; i++) {
              await repos.response.upsert({
                memberId: memberIds[i],
                sessionId: session.id,
                questionId,
                score: scores[i],
                trendIndicator: 'stable',
              });
            }

            // Create the materialised aggregate
            const sum = scores.slice(0, actualResponseCount).reduce((a, b) => a + b, 0);
            const avgScore = Math.round((sum / actualResponseCount) * 10) / 10;

            await repos.sessionAggregate.create({
              sessionId: session.id,
              questionId,
              averageScore: avgScore,
              responseCount: actualResponseCount,
              improvingCount: 0,
              stableCount: actualResponseCount,
              decliningCount: 0,
            });

            // Create TrendService with configurable threshold
            const trendService = createTrendService(
              {
                sessionAggregateRepo: repos.sessionAggregate,
                sessionRepo: repos.session,
                teamRepo: repos.team,
              },
              { anonymityThreshold: threshold }
            );

            // Call getSessionAverages
            const results = await trendService.getSessionAverages(team.id, questionId);

            // Verify no result exposes individual member IDs or individual scores
            for (const result of results) {
              // Result should never contain member IDs
              const resultStr = JSON.stringify(result);
              for (const memberId of memberIds) {
                expect(resultStr).not.toContain(memberId);
              }
              for (const name of memberNames) {
                expect(resultStr).not.toContain(name);
              }
              for (const email of memberEmails) {
                expect(resultStr).not.toContain(email);
              }

              // If below threshold, data must be suppressed
              if (result.responseCount < threshold) {
                expect(result.averageScore).toBeNull();
                expect(result.suppressed).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('exportCSV never contains member names or emails in anonymous mode', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          thresholdArb,
          fc.array(scoreArb, { minLength: 1, maxLength: 10 }),
          trendArb,
          async (memberCount, threshold, scores, trend) => {
            const repos = createInMemoryRepositories();

            // Create a team in anonymous privacy mode
            const team = await repos.team.create({
              name: 'Anonymous Team',
              privacyMode: 'anonymous',
            });

            const questionId = 'q-team-collaboration';

            // Create a session
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });

            // Register session-team mapping
            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            // Create members
            const memberIds: string[] = [];
            const memberNames: string[] = [];
            const memberEmails: string[] = [];
            const actualResponseCount = Math.min(memberCount, scores.length);

            for (let i = 0; i < memberCount; i++) {
              const member = await repos.teamMember.create({
                teamId: team.id,
                name: `Person ${i}`,
                email: `person${i}@company.org`,
              });
              memberIds.push(member.id);
              memberNames.push(member.name);
              memberEmails.push(member.email!);
            }

            // Submit responses
            for (let i = 0; i < actualResponseCount; i++) {
              await repos.response.upsert({
                memberId: memberIds[i],
                sessionId: session.id,
                questionId,
                score: scores[i],
                trendIndicator: trend,
              });
            }

            // Create materialised aggregate
            const sum = scores.slice(0, actualResponseCount).reduce((a, b) => a + b, 0);
            const avgScore = Math.round((sum / actualResponseCount) * 10) / 10;

            await repos.sessionAggregate.create({
              sessionId: session.id,
              questionId,
              averageScore: avgScore,
              responseCount: actualResponseCount,
              improvingCount: trend === 'improving' ? actualResponseCount : 0,
              stableCount: trend === 'stable' ? actualResponseCount : 0,
              decliningCount: trend === 'declining' ? actualResponseCount : 0,
            });

            // Create TrendService
            const trendService = createTrendService(
              {
                sessionAggregateRepo: repos.sessionAggregate,
                sessionRepo: repos.session,
                teamRepo: repos.team,
              },
              { anonymityThreshold: threshold }
            );

            // Call exportCSV
            const csv = await trendService.exportCSV(team.id);

            // Verify CSV never contains member names, emails, or IDs
            for (const memberId of memberIds) {
              expect(csv).not.toContain(memberId);
            }
            for (const name of memberNames) {
              expect(csv).not.toContain(name);
            }
            for (const email of memberEmails) {
              expect(csv).not.toContain(email);
            }

            // Verify no individual scores appear as identifiable per-member rows
            // CSV should only have aggregated columns
            const lines = csv.split('\n');
            const header = lines[0];
            expect(header).not.toContain('Member');
            expect(header).not.toContain('member');
            expect(header).not.toContain('Email');
            expect(header).not.toContain('email');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('data is suppressed (averageScore = null) when response count is below threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          thresholdArb,
          fc.integer({ min: 1, max: 2 }),
          scoreArb,
          async (threshold, belowThresholdCount, score) => {
            // Ensure belowThresholdCount is actually below threshold
            fc.pre(belowThresholdCount < threshold);

            const repos = createInMemoryRepositories();

            // Create team in anonymous mode
            const team = await repos.team.create({
              name: 'Low Response Team',
              privacyMode: 'anonymous',
            });

            const questionId = 'q-ease-of-delivery';

            // Create a session
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });

            // Register session-team mapping
            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            // Create aggregate with below-threshold response count
            await repos.sessionAggregate.create({
              sessionId: session.id,
              questionId,
              averageScore: score,
              responseCount: belowThresholdCount,
              improvingCount: 0,
              stableCount: belowThresholdCount,
              decliningCount: 0,
            });

            // Create TrendService with specific threshold
            const trendService = createTrendService(
              {
                sessionAggregateRepo: repos.sessionAggregate,
                sessionRepo: repos.session,
                teamRepo: repos.team,
              },
              { anonymityThreshold: threshold }
            );

            // Call getSessionAverages
            const results = await trendService.getSessionAverages(team.id, questionId);

            // Data below threshold must be suppressed
            expect(results).toHaveLength(1);
            expect(results[0].averageScore).toBeNull();
            expect(results[0].suppressed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
