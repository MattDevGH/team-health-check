/**
 * Property Test: Response submission round-trip
 *
 * Feature: integration-hardening, Property 6: Response submission round-trip
 *
 * **Validates: Requirements 5.1, 5.4**
 *
 * For any valid submission (authenticated member via cookie, open session,
 * valid scores 1-5, valid questionIds), the response SHALL contain a `responses`
 * array where each item includes the submitted `questionId`, `score`, optional
 * `trendIndicator`, and a numeric `rollingAverage`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';

import { POST, _repos as repos } from './route';

/** Known question IDs from the InMemoryQuestionRepository */
const QUESTION_IDS = [
  'q-delivering-value',
  'q-team-collaboration',
  'q-ease-of-delivery',
  'q-learning-improving',
  'q-psychological-safety',
] as const;

const VALID_TREND_INDICATORS = ['improving', 'stable', 'declining'] as const;

/**
 * Arbitrary for valid scores (integers 1-5).
 */
const scoreArb = fc.integer({ min: 1, max: 5 });

/**
 * Arbitrary for optional trend indicator.
 */
const trendIndicatorArb = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom(...VALID_TREND_INDICATORS),
);

/**
 * Arbitrary for a non-empty subset of question IDs (at least 1, up to all 5).
 */
const questionSubsetArb = fc.shuffledSubarray([...QUESTION_IDS], { minLength: 1 });

/**
 * Arbitrary for a single response item: { questionId, score, trendIndicator? }
 */
function responseItemArb(questionId: string) {
  return fc.record({
    questionId: fc.constant(questionId),
    score: scoreArb,
    trendIndicator: trendIndicatorArb,
  });
}

/**
 * Helper to build a POST request with session cookie and JSON body.
 */
function makePostRequest(sessionToken: string, body: unknown): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('cookie', `session=${sessionToken}`);
  return new NextRequest('http://localhost/api/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Property 6: Response submission round-trip', () => {
  let teamId: string;
  let memberId: string;
  let sessionId: string;
  let sessionToken: string;

  beforeEach(async () => {
    sessionToken = crypto.randomUUID();

    // Seed: team, member, open session, user session for auth
    const team = await repos.team.create({ name: 'Prop6 Team' });
    teamId = team.id;

    const member = await repos.teamMember.create({
      teamId,
      name: 'Prop6 Member',
      email: 'prop6@example.com',
    });
    memberId = member.id;

    const session = await repos.session.create({ teamId, status: 'open' });
    sessionId = session.id;

    await repos.userSession.create({
      memberId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 3_600_000), // 1 hour
    });
  });

  it('response contains questionId, score, trendIndicator, and rollingAverage for every submitted item', async () => {
    await fc.assert(
      fc.asyncProperty(
        questionSubsetArb,
        fc.array(scoreArb, { minLength: 5, maxLength: 5 }),
        fc.array(trendIndicatorArb, { minLength: 5, maxLength: 5 }),
        async (questionIds, scores, trendIndicators) => {
          // Build response items from the generated question subset
          const submittedResponses = questionIds.map((qId, idx) => {
            const item: { questionId: string; score: number; trendIndicator?: string } = {
              questionId: qId,
              score: scores[idx % scores.length],
            };
            const trend = trendIndicators[idx % trendIndicators.length];
            if (trend !== undefined) {
              item.trendIndicator = trend;
            }
            return item;
          });

          const request = makePostRequest(sessionToken, {
            sessionId,
            responses: submittedResponses,
          });

          const response = await POST(request, { params: Promise.resolve({}) });

          // Verify: status 200
          expect(response.status).toBe(200);

          const body = await response.json();

          // Verify: body has responses array with correct length
          expect(body.responses).toBeDefined();
          expect(Array.isArray(body.responses)).toBe(true);
          expect(body.responses).toHaveLength(submittedResponses.length);

          // Verify: each item has the required shape
          for (let i = 0; i < body.responses.length; i++) {
            const result = body.responses[i];
            const submitted = submittedResponses[i];

            // questionId matches
            expect(result.questionId).toBe(submitted.questionId);

            // score matches
            expect(result.score).toBe(submitted.score);

            // trendIndicator is present (null or a valid string)
            expect(result).toHaveProperty('trendIndicator');
            if (submitted.trendIndicator) {
              expect(result.trendIndicator).toBe(submitted.trendIndicator);
            } else {
              expect(result.trendIndicator).toBeNull();
            }

            // rollingAverage is present (null or a number)
            expect(result).toHaveProperty('rollingAverage');
            expect(
              result.rollingAverage === null ||
              typeof result.rollingAverage === 'number'
            ).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
