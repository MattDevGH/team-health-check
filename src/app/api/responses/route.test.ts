/**
 * Tests for POST /api/responses
 * Requirements: 2.5, 5.1, 5.2, 5.3, 5.4
 *
 * Validates: cookie-based auth (withAuth), body-based sessionId,
 * and correct response shape { responses: [{ questionId, score, trendIndicator, rollingAverage }] }
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, _repos as repos } from './route';

function makeAuthRequest(
  sessionToken: string | undefined,
  body: unknown,
): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (sessionToken) {
    headers.set('cookie', `session=${sessionToken}`);
  }
  return new NextRequest('http://localhost/api/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/responses', () => {
  let teamId: string;
  let memberId: string;
  let sessionId: string;
  let sessionToken: string;

  beforeEach(async () => {
    // Use a unique token per test to avoid state leakage in the singleton repos
    sessionToken = crypto.randomUUID();

    // Set up a team, member, and open session via the shared module-level repos
    const team = await repos.team.create({ name: 'Test Team' });
    teamId = team.id;

    const member = await repos.teamMember.create({
      teamId,
      name: 'Alice',
      email: 'alice@example.com',
    });
    memberId = member.id;

    const session = await repos.session.create({ teamId, status: 'open' });
    sessionId = session.id;

    // Create a valid user session for cookie-based auth
    await repos.userSession.create({
      memberId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it('returns 401 when no session cookie is present', async () => {
    const request = makeAuthRequest(undefined, {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 4 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const request = makeAuthRequest('invalid-token', {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 4 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('accepts valid cookie + body { sessionId, responses } and returns correct shape', async () => {
    const request = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [
        { questionId: 'q-delivering-value', score: 4 },
        { questionId: 'q-team-collaboration', score: 5, trendIndicator: 'improving' },
      ],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responses).toHaveLength(2);

    // Verify the response shape matches { questionId, score, trendIndicator, rollingAverage }
    // rollingAverage is null when fewer than 5 data points exist
    expect(body.responses[0]).toEqual({
      questionId: 'q-delivering-value',
      score: 4,
      trendIndicator: null,
      rollingAverage: null,
    });
    expect(body.responses[1]).toEqual({
      questionId: 'q-team-collaboration',
      score: 5,
      trendIndicator: 'improving',
      rollingAverage: null,
    });

    // Verify each response has exactly the 4 expected keys
    for (const resp of body.responses) {
      expect(Object.keys(resp).sort()).toEqual(
        ['questionId', 'rollingAverage', 'score', 'trendIndicator']
      );
    }
  });

  it('returns rollingAverage for each submitted question', async () => {
    const request = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [
        { questionId: 'q-delivering-value', score: 3 },
      ],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responses[0]).toHaveProperty('rollingAverage');
    // rollingAverage should be null (fewer than 5 data points) or a number
    expect(
      body.responses[0].rollingAverage === null ||
      typeof body.responses[0].rollingAverage === 'number'
    ).toBe(true);
  });

  it('returns 400 for empty responses array', async () => {
    const request = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when sessionId is missing from body', async () => {
    const request = makeAuthRequest(sessionToken, {
      responses: [{ questionId: 'q-delivering-value', score: 4 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for score outside 1-5 range', async () => {
    const request = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 6 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
  });

  it('returns 404 when session not found', async () => {
    const request = makeAuthRequest(sessionToken, {
      sessionId: 'nonexistent-session',
      responses: [{ questionId: 'q-delivering-value', score: 3 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(404);
  });

  it('returns 409 when session is closed', async () => {
    // Close the session
    await repos.session.update(sessionId, { status: 'closed', actualCloseAt: new Date() });

    const request = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 3 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(409);
  });

  it('returns 404 when member (from cookie) not found in team member repo', async () => {
    // Create a session token for a non-existent member
    await repos.userSession.create({
      memberId: 'nonexistent-member',
      token: 'ghost-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const request = makeAuthRequest('ghost-token', {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 3 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(404);
  });

  it('returns 403 when member does not belong to session team', async () => {
    // Create another team and member
    const otherTeam = await repos.team.create({ name: 'Other Team' });
    const otherMember = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Bob',
    });

    // Create a session token for the other member
    await repos.userSession.create({
      memberId: otherMember.id,
      token: 'other-member-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const request = makeAuthRequest('other-member-token', {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 3 }],
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
  });

  it('upserts existing response on resubmit', async () => {
    // Submit first time
    const req1 = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 3 }],
    });
    await POST(req1, { params: Promise.resolve({}) });

    // Submit again with updated score
    const req2 = makeAuthRequest(sessionToken, {
      sessionId,
      responses: [{ questionId: 'q-delivering-value', score: 5 }],
    });
    const response = await POST(req2, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responses[0].score).toBe(5);
  });
});
