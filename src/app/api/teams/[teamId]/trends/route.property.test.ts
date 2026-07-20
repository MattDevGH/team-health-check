/**
 * Property Test: Trends sessions are chronologically ordered
 *
 * Feature: integration-hardening, Property 5: Trends sessions are chronologically ordered
 *
 * **Validates: Requirements 4.3**
 *
 * For any team with two or more closed sessions that were opened at different times,
 * the `sessions` array in the trends response SHALL be ordered with the earliest
 * closedAt first and the latest closedAt last.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';

import { GET, _testRepos as repos } from './route';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/** Helper to register session-team mapping in the in-memory aggregate repo */
function registerSessionTeam(sessionId: string, teamId: string): void {
  (repos.sessionAggregate as InMemorySessionAggregateRepository).registerSessionTeam(sessionId, teamId);
}

function makeAuthRequest(url: string, sessionToken: string): NextRequest {
  const headers = new Headers();
  headers.set('cookie', `session=${sessionToken}`);
  return new NextRequest(url, { method: 'GET', headers });
}

/**
 * Arbitrary for a list of 2-5 unique past dates (closedAt timestamps).
 * Generates distinct millisecond values in the past to ensure ordering is testable.
 */
const uniquePastDatesArb = fc
  .uniqueArray(
    fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000, // up to 1 year ago
      max: Date.now() - 60_000,                      // at least 1 minute ago
    }),
    { minLength: 2, maxLength: 5 },
  )
  .map(timestamps => timestamps.map(ts => new Date(ts)));

describe('Property 5: Trends sessions are chronologically ordered', () => {
  it('sessions array is ordered with earliest closedAt first and latest closedAt last', async () => {
    await fc.assert(
      fc.asyncProperty(uniquePastDatesArb, async (closedAtDates) => {
        // Seed: fresh team, member, user session per iteration to avoid cross-contamination
        const team = await repos.team.create({ name: 'Trends Ordering Team' });
        const teamId = team.id;

        const member = await repos.teamMember.create({
          teamId,
          name: 'Prop5 Member',
          email: `prop5-${crypto.randomUUID()}@example.com`,
        });

        const sessionToken = crypto.randomUUID();
        await repos.userSession.create({
          memberId: member.id,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 3_600_000), // 1 hour
        });

        // For each closedAt date: create a closed session, register session-team, create aggregate
        for (const closedAt of closedAtDates) {
          const session = await repos.session.create({ teamId, status: 'closed' });
          await repos.session.update(session.id, { status: 'closed', actualCloseAt: closedAt });
          registerSessionTeam(session.id, teamId);
          await repos.sessionAggregate.create({
            sessionId: session.id,
            questionId: 'q-delivering-value',
            averageScore: 3.5,
            responseCount: 5,
            improvingCount: 1,
            stableCount: 2,
            decliningCount: 2,
          });
        }

        // Call the GET route handler
        const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
        const context = { params: Promise.resolve({ teamId }) };
        const response = await GET(request, context);

        expect(response.status).toBe(200);

        const body = await response.json();

        // Verify: sessions array has correct count
        expect(body.sessions.length).toBe(closedAtDates.length);

        // Verify: sessions are in ascending closedAt order
        for (let i = 1; i < body.sessions.length; i++) {
          const prev = new Date(body.sessions[i - 1].closedAt).getTime();
          const curr = new Date(body.sessions[i].closedAt).getTime();
          expect(prev).toBeLessThan(curr);
        }
      }),
      { numRuns: 50 },
    );
  });
});
