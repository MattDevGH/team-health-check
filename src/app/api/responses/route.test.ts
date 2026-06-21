/**
 * Tests for POST /api/responses
 * Requirements: 4.4, 4.6, 16.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { POST, _repos as repos } from './route';

describe('POST /api/responses', () => {
  let teamId: string;
  let memberId: string;
  let sessionId: string;

  beforeEach(async () => {
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
  });

  it('accepts valid responses and returns rolling averages', async () => {
    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [
          { questionId: 'q-delivering-value', score: 4 },
          { questionId: 'q-team-collaboration', score: 5, trendIndicator: 'improving' },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responses).toHaveLength(2);
    expect(body.responses[0]).toMatchObject({
      questionId: 'q-delivering-value',
      score: 4,
    });
    expect(body.responses[1]).toMatchObject({
      questionId: 'q-team-collaboration',
      score: 5,
      trendIndicator: 'improving',
    });
    // Rolling averages should be null (fewer than 5 data points)
    expect(body.responses[0].rollingAverage).toBeNull();
    expect(body.responses[1].rollingAverage).toBeNull();
  });

  it('returns 400 for empty responses array', async () => {
    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({ responses: [] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for score outside 1-5 range', async () => {
    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 6 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 when session not found', async () => {
    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': 'nonexistent-session',
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 3 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('returns 409 when session is closed', async () => {
    // Close the session
    await repos.session.update(sessionId, { status: 'closed', actualCloseAt: new Date() });

    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 3 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it('returns 404 when member not found', async () => {
    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': 'nonexistent-member',
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 3 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('returns 403 when member does not belong to session team', async () => {
    // Create another team and member
    const otherTeam = await repos.team.create({ name: 'Other Team' });
    const otherMember = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Bob',
    });

    const request = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': otherMember.id,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 3 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('upserts existing response on resubmit (Req 10.3)', async () => {
    // Submit first time
    const req1 = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 3 }],
      }),
    });
    await POST(req1);

    // Submit again with updated score
    const req2 = new Request('http://localhost/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-member-id': memberId,
        'x-session-id': sessionId,
      },
      body: JSON.stringify({
        responses: [{ questionId: 'q-delivering-value', score: 5 }],
      }),
    });
    const response = await POST(req2);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.responses[0].score).toBe(5);
  });
});
