/**
 * Tests for GET /api/teams/[teamId]/trends
 * Requirements: 4.1, 4.2, 4.3, 9.1
 *
 * Validates: cookie-based auth, team membership authorization,
 * and response reshaping to frontend contract (closedAt, averages[], trendDistribution array).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _testRepos as repos } from './route';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/** Helper to register session-team mapping in the in-memory aggregate repo */
function registerSessionTeam(sessionId: string, teamId: string): void {
  (repos.sessionAggregate as InMemorySessionAggregateRepository).registerSessionTeam(sessionId, teamId);
}

function makeAuthRequest(
  url: string,
  sessionToken?: string,
): NextRequest {
  const headers = new Headers();
  if (sessionToken) {
    headers.set('cookie', `session=${sessionToken}`);
  }
  return new NextRequest(url, { method: 'GET', headers });
}

async function createSession(memberId: string): Promise<string> {
  const token = `session-token-${Date.now()}-${Math.random()}`;
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
}

describe('GET /api/teams/[teamId]/trends', () => {
  let teamId: string;
  let memberId: string;
  let sessionToken: string;

  beforeEach(async () => {
    const team = await repos.team.create({ name: 'Trends Team' });
    teamId = team.id;

    const member = await repos.teamMember.create({
      teamId,
      name: 'Alice',
      email: 'alice@example.com',
    });
    memberId = member.id;

    sessionToken = await createSession(memberId);
  });

  /**
   * Dashboard Refinement 3.3, 4.1.
   *
   * The dashboard derives its list of question themes from the aggregates, so a
   * theme nobody has answered does not exist as far as the page is concerned.
   * Sending the catalogue is what makes absence representable — and it carries
   * the question text, which has been in the database since the first migration
   * and displayed nowhere.
   */
  describe('the question catalogue', () => {
    it('carries every question with its theme and its text', async () => {
      const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
      const res = await GET(request, { params: Promise.resolve({ teamId }) });
      const body = await res.json();

      // The five are fixed for every team — the repository is read-only
      const canonical = await repos.question.findAll();
      expect(body.questions).toHaveLength(canonical.length);

      const delivering = body.questions.find(
        (q: { id: string }) => q.id === 'q-delivering-value',
      );
      expect(delivering.title, 'the theme a manager sees').toBe('Delivering Value');
      expect(
        delivering.description,
        'the question a team member is actually asked',
      ).toMatch(/^How well is the team delivering value/);
    });

    it('carries questions no session has answered', async () => {
      // The whole point: a team that has never run a check still needs its
      // themes named, and a theme with no aggregates must not vanish
      const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
      const res = await GET(request, { params: Promise.resolve({ teamId }) });
      const body = await res.json();

      expect(body.requiresMoreData, 'no closed sessions in this fixture').toBe(true);
      expect(body.sessions).toEqual([]);
      expect(body.questions.map((q: { id: string }) => q.id)).toContain('q-psychological-safety');
    });
  });

  // ─── Auth Tests ──────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie is present', async () => {
    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, 'invalid-token');
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(401);
  });

  it('returns 403 when member does not belong to team', async () => {
    // Create another team + member
    const otherTeam = await repos.team.create({ name: 'Other Team' });
    const otherMember = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Bob',
      email: 'bob@example.com',
    });
    const otherToken = await createSession(otherMember.id);

    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, otherToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(403);
  });

  // ─── Response Shape Tests ────────────────────────────────────────────────────

  it('response matches frontend contract with closedAt, averages[], trendDistribution array', async () => {
    // Create two closed sessions with aggregates
    const session1 = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(session1.id, { status: 'closed', actualCloseAt: new Date('2025-01-10T12:00:00Z') });
    registerSessionTeam(session1.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: session1.id,
      questionId: 'q-delivering-value',
      averageScore: 3.5,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    const session2 = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(session2.id, { status: 'closed', actualCloseAt: new Date('2025-01-17T12:00:00Z') });
    registerSessionTeam(session2.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: session2.id,
      questionId: 'q-delivering-value',
      averageScore: 4.0,
      responseCount: 5,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 1,
    });

    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();

    // sessions is an array with the contract shape
    expect(body.sessions).toBeInstanceOf(Array);
    expect(body.sessions.length).toBe(2);

    // Each session has sessionId, closedAt (ISO string), and averages array
    for (const s of body.sessions) {
      expect(s).toHaveProperty('sessionId');
      expect(s).toHaveProperty('closedAt');
      expect(typeof s.closedAt).toBe('string');
      // closedAt should be a valid ISO date string
      expect(new Date(s.closedAt).toISOString()).toBe(s.closedAt);
      expect(s).toHaveProperty('averages');
      expect(s.averages).toBeInstanceOf(Array);
      for (const avg of s.averages) {
        expect(avg).toHaveProperty('questionId');
        expect(avg).toHaveProperty('averageScore');
        expect(avg).toHaveProperty('responseCount');
      }
    }

    // trendDistribution is an array (not object)
    expect(body.trendDistribution).toBeInstanceOf(Array);
    for (const td of body.trendDistribution) {
      expect(td).toHaveProperty('questionId');
      expect(td).toHaveProperty('improving');
      expect(td).toHaveProperty('stable');
      expect(td).toHaveProperty('declining');
    }

    // privacyMode is included
    expect(body).toHaveProperty('privacyMode');
  });

  it('sessions are ordered chronologically (oldest first)', async () => {
    // Create sessions in reverse chronological order
    const sessionOlder = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(sessionOlder.id, { status: 'closed', actualCloseAt: new Date('2025-01-05T12:00:00Z') });
    registerSessionTeam(sessionOlder.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: sessionOlder.id,
      questionId: 'q1',
      averageScore: 3.0,
      responseCount: 5,
      improvingCount: 1,
      stableCount: 2,
      decliningCount: 2,
    });

    const sessionNewer = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(sessionNewer.id, { status: 'closed', actualCloseAt: new Date('2025-01-20T12:00:00Z') });
    registerSessionTeam(sessionNewer.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: sessionNewer.id,
      questionId: 'q1',
      averageScore: 4.5,
      responseCount: 5,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 1,
    });

    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    const body = await response.json();

    expect(body.sessions[0].closedAt).toBe('2025-01-05T12:00:00.000Z');
    expect(body.sessions[1].closedAt).toBe('2025-01-20T12:00:00.000Z');
  });

  // ─── Fewer than 2 sessions → requiresMoreData ────────────────────────────────

  it('returns requiresMoreData: true with empty arrays when no closed sessions exist', async () => {
    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.requiresMoreData).toBe(true);
    expect(body.sessions).toEqual([]);
    expect(body.trendDistribution).toEqual([]);
  });

  it('returns requiresMoreData: true when only one closed session exists', async () => {
    const session1 = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(session1.id, { status: 'closed', actualCloseAt: new Date('2025-01-10T12:00:00Z') });
    registerSessionTeam(session1.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: session1.id,
      questionId: 'q1',
      averageScore: 4.0,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.requiresMoreData).toBe(true);
    expect(body.sessions).toEqual([]);
    expect(body.trendDistribution).toEqual([]);
  });

  it('does not include requiresMoreData when 2+ closed sessions exist', async () => {
    const session1 = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(session1.id, { status: 'closed', actualCloseAt: new Date('2025-01-10T12:00:00Z') });
    registerSessionTeam(session1.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: session1.id,
      questionId: 'q1',
      averageScore: 3.5,
      responseCount: 5,
      improvingCount: 1,
      stableCount: 2,
      decliningCount: 2,
    });

    const session2 = await repos.session.create({ teamId, status: 'closed' });
    await repos.session.update(session2.id, { status: 'closed', actualCloseAt: new Date('2025-01-17T12:00:00Z') });
    registerSessionTeam(session2.id, teamId);
    await repos.sessionAggregate.create({
      sessionId: session2.id,
      questionId: 'q1',
      averageScore: 4.0,
      responseCount: 5,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 1,
    });

    const request = makeAuthRequest(`http://localhost/api/teams/${teamId}/trends`, sessionToken);
    const context = { params: Promise.resolve({ teamId }) };

    const response = await GET(request, context);
    const body = await response.json();

    expect(body.requiresMoreData).toBeUndefined();
    expect(body.sessions.length).toBe(2);
  });
});
