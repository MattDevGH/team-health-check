import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createResponseService } from '@/lib/services/response.service';

/**
 * **Validates: Requirements 16.1, 16.2, 16.3**
 *
 * Property 21: Rolling average computation correctness
 *
 * For any question and team, the rolling average SHALL equal the arithmetic mean
 * of the most recent N scores (default 20) across current and previous sessions.
 * The average SHALL only be displayed when at least 5 responses exist for that question.
 */
describe('Property 21: Rolling average computation correctness', () => {
  it('rolling average equals arithmetic mean of most recent N scores when >= 5 responses exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 5 and 30 scores (ensuring we have enough for a valid average)
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 5, maxLength: 30 }),
        // Generate a count value for the rolling window (5-30)
        fc.integer({ min: 5, max: 30 }),
        async (scores, count) => {
          const repos = createInMemoryRepositories();

          // Set up a team
          const team = await repos.team.create({
            name: 'Test Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const questionId = 'q-delivering-value';

          // Create responses across multiple sessions with distinct timestamps
          // Use a base time and increment by 1 second per response to ensure ordering
          const baseTime = Date.now();
          for (let i = 0; i < scores.length; i++) {
            const member = await repos.teamMember.create({
              teamId: team.id,
              name: `Member ${i}`,
            });

            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });

            // Use the repo directly to create with controlled timestamp
            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId,
              score: scores[i],
            });

            // Patch submittedAt to ensure deterministic ordering
            // Access the internal response to set a distinct timestamp
            const responses = await repos.response.findByMemberAndSession(member.id, session.id);
            const response = responses[0];
            response.submittedAt = new Date(baseTime + i * 1000);
          }

          const responseService = createResponseService({
            responseRepo: repos.response,
            sessionRepo: repos.session,
            teamMemberRepo: repos.teamMember,
          });

          const result = await responseService.getRollingAverage(team.id, questionId, count);

          // The repo returns responses sorted by submittedAt DESC, sliced to `count`.
          // Most recent responses are the ones created last (highest index in our scores array).
          // Take the last `count` scores (most recent), which is what the service will compute.
          const recentCount = Math.min(count, scores.length);
          const recentScores = scores.slice(scores.length - recentCount);
          const sum = recentScores.reduce((acc, s) => acc + s, 0);
          const expected = Math.round((sum / recentScores.length) * 10) / 10;

          expect(result).toBe(expected);
        },
      ),
    );
  });

  it('returns null when fewer than 5 responses exist (boundary: exactly 4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate exactly 1-4 scores (below threshold)
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 4 }),
        async (scores) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Test Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const questionId = 'q-delivering-value';

          // Create responses (fewer than 5)
          for (let i = 0; i < scores.length; i++) {
            const member = await repos.teamMember.create({
              teamId: team.id,
              name: `Member ${i}`,
            });

            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });

            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId,
              score: scores[i],
            });
          }

          const responseService = createResponseService({
            responseRepo: repos.response,
            sessionRepo: repos.session,
            teamMemberRepo: repos.teamMember,
          });

          const result = await responseService.getRollingAverage(team.id, questionId);

          // Must return null when fewer than 5 responses exist
          expect(result).toBeNull();
        },
      ),
    );
  });

  it('returns valid average at exactly 5 responses (boundary)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate exactly 5 scores (minimum threshold)
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 5, maxLength: 5 }),
        async (scores) => {
          const repos = createInMemoryRepositories();

          const team = await repos.team.create({
            name: 'Test Team',
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          });

          const questionId = 'q-delivering-value';

          for (let i = 0; i < scores.length; i++) {
            const member = await repos.teamMember.create({
              teamId: team.id,
              name: `Member ${i}`,
            });

            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });

            await repos.response.upsert({
              memberId: member.id,
              sessionId: session.id,
              questionId,
              score: scores[i],
            });
          }

          const responseService = createResponseService({
            responseRepo: repos.response,
            sessionRepo: repos.session,
            teamMemberRepo: repos.teamMember,
          });

          const result = await responseService.getRollingAverage(team.id, questionId);

          // With exactly 5 responses the result must be a valid number (not null)
          expect(result).not.toBeNull();

          // Verify correctness: average of all 5 scores rounded to 1 decimal
          const sum = scores.reduce((acc, s) => acc + s, 0);
          const expected = Math.round((sum / scores.length) * 10) / 10;
          expect(result).toBe(expected);
        },
      ),
    );
  });
});
