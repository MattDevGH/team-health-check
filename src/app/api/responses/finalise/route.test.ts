/**
 * Tests for POST /api/responses/finalise
 *
 * Requirements: 18.1, 18.2, 18.3
 *
 * These read the stored responses back rather than trusting the response body:
 * a 200 proves the route answered, not that anything was marked final.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, _repos as repos } from './route';

function makeRequest(sessionToken: string | undefined, body: unknown): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (sessionToken) headers.set('cookie', `session=${sessionToken}`);

  return new NextRequest('http://localhost/api/responses/finalise', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({}) };

describe('POST /api/responses/finalise', () => {
  let memberId: string;
  let otherId: string;
  let sessionId: string;
  let sessionToken: string;

  beforeEach(async () => {
    sessionToken = crypto.randomUUID();

    const team = await repos.team.create({ name: 'Finalise Route Team' });
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Alice',
      email: `alice-${sessionToken}@example.invalid`,
    });
    const other = await repos.teamMember.create({
      teamId: team.id,
      name: 'Bea',
      email: `bea-${sessionToken}@example.invalid`,
    });
    memberId = member.id;
    otherId = other.id;

    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    sessionId = session.id;

    await repos.userSession.create({
      memberId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await POST(makeRequest(undefined, { sessionId }), params);

    expect(response.status).toBe(401);
  });

  it('marks every answer this member gave in the session', async () => {
    for (const questionId of ['q-delivering-value', 'q-team-collaboration']) {
      await repos.response.upsert({ memberId, sessionId, questionId, score: 4 });
    }

    const response = await POST(makeRequest(sessionToken, { sessionId }), params);
    expect(response.status).toBe(200);

    const stored = await repos.response.findByMemberAndSession(memberId, sessionId);
    expect(stored).toHaveLength(2);
    expect(stored.every(entry => entry.finalisedAt !== null)).toBe(true);
  });

  /**
   * The member comes from the cookie, never the body. Accepting one here would
   * let anyone finish somebody else's answers for them — an edit to another
   * person's data, and a way to force their score into the rolling average
   * before they had finished thinking.
   */
  it('cannot be aimed at another member', async () => {
    await repos.response.upsert({
      memberId: otherId,
      sessionId,
      questionId: 'q-delivering-value',
      score: 2,
    });

    const response = await POST(makeRequest(sessionToken, { sessionId, memberId: otherId }), params);

    // The caller has no answers of their own, so there is nothing to finish
    expect(response.status).toBe(409);

    const theirs = await repos.response.findByMemberAndSession(otherId, sessionId);
    expect(theirs[0]?.finalisedAt).toBeNull();
  });

  it('refuses when the member has answered nothing', async () => {
    const response = await POST(makeRequest(sessionToken, { sessionId }), params);

    expect(response.status).toBe(409);
  });

  it('rejects a body with no session', async () => {
    const response = await POST(makeRequest(sessionToken, {}), params);

    expect(response.status).toBe(400);
  });

  it('reports a session that does not exist as not found', async () => {
    const response = await POST(makeRequest(sessionToken, { sessionId: 'nope' }), params);

    expect(response.status).toBe(404);
  });
});
