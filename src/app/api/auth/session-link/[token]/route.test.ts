import { describe, it, expect, beforeEach } from 'vitest';
import { resetRateLimitStore } from '@/lib/rate-limit';

// We import after resetting rate limit store, so module-level state is clean
import { GET, _testRepos as repos } from './route';

/**
 * Tests for GET /api/auth/session-link/[token]
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.3, 6.4, 6.7
 */

function makeRequest(token: string, ip = '127.0.0.1') {
  return new Request(`http://localhost/api/auth/session-link/${token}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

function makeContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

let seedCounter = 0;

/**
 * Seeds a complete scenario: team member, session, session link, and questions.
 * Returns identifiers for assertions. Uses unique IDs per call to avoid conflicts.
 */
async function seedValidScenario(options?: {
  sessionStatus?: 'open' | 'closed';
  closesAt?: Date;
  cadencePreference?: string;
}) {
  seedCounter++;
  const suffix = seedCounter;
  const teamId = `team-enriched-${suffix}`;
  const memberId = `member-enriched-${suffix}`;
  const token = `enriched-token-${suffix}-${'x'.repeat(14)}`;

  // Seed team member
  await repos.teamMember.create({
    id: memberId,
    teamId,
    name: `Alice Test ${suffix}`,
    email: `alice-${suffix}@example.com`,
  });

  // Update cadence preference if specified
  if (options?.cadencePreference) {
    await repos.teamMember.update(memberId, { cadencePreference: options.cadencePreference });
  }

  // Seed session
  const closesAt = options?.closesAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
  const isClosed = options?.sessionStatus === 'closed';
  const session = await repos.session.create({
    teamId,
    status: isClosed ? 'closed' : 'open',
    scheduledCloseAt: closesAt,
  });

  // Seed session link
  await repos.sessionLink.create({
    token,
    memberId,
    sessionId: session.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { teamId, memberId, sessionId: session.id, token, closesAt };
}

describe('GET /api/auth/session-link/[token]', () => {
  beforeEach(async () => {
    resetRateLimitStore();
  });

  it('returns member and session context for a valid token', async () => {
    // Seed a session link
    const memberId = 'member-1';
    const sessionId = 'session-1';
    const token = 'a'.repeat(32);
    await repos.sessionLink.create({
      token,
      memberId,
      sessionId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    });

    const request = makeRequest(token);
    const response = await GET(request, makeContext(token));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberId).toBe(memberId);
    expect(body.sessionId).toBe(sessionId);
  });

  it('returns 404 for an invalid token', async () => {
    const token = 'nonexistent-token-value';

    const request = makeRequest(token);
    const response = await GET(request, makeContext(token));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Invalid or expired session link');
  });

  it('returns 404 for an expired token', async () => {
    const memberId = 'member-2';
    const sessionId = 'session-2';
    const token = 'b'.repeat(32);
    await repos.sessionLink.create({
      token,
      memberId,
      sessionId,
      expiresAt: new Date(Date.now() - 1000), // Already expired
    });

    const request = makeRequest(token);
    const response = await GET(request, makeContext(token));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 429 after exceeding rate limit (10 failures from same IP)', async () => {
    const ip = '192.168.1.100';

    // Make 10 failed attempts from the same IP
    for (let i = 0; i < 10; i++) {
      const token = `invalid-token-${i}`;
      const request = makeRequest(token, ip);
      const response = await GET(request, makeContext(token));
      expect(response.status).toBe(404);
    }

    // 11th attempt should be rate limited
    const token = 'invalid-token-11';
    const request = makeRequest(token, ip);
    const response = await GET(request, makeContext(token));

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('does not rate limit successful validations', async () => {
    const ip = '10.0.0.1';
    const memberId = 'member-3';
    const sessionId = 'session-3';

    // Create 11 valid tokens and access them all from the same IP
    for (let i = 0; i < 11; i++) {
      const token = `valid-token-${'c'.repeat(28)}-${String(i).padStart(2, '0')}`;
      await repos.sessionLink.create({
        token,
        memberId,
        sessionId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const request = makeRequest(token, ip);
      const response = await GET(request, makeContext(token));
      expect(response.status).toBe(200);
    }
  });

  it('uses "unknown" as IP when x-forwarded-for header is missing', async () => {
    const token = 'no-header-token';
    const request = new Request(`http://localhost/api/auth/session-link/${token}`, {
      method: 'GET',
    });

    const response = await GET(request, makeContext(token));

    // Should still work (404 for invalid token, not crash)
    expect(response.status).toBe(404);
  });

  describe('enriched response (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)', () => {
    it('returns memberId, sessionId, memberName, cadencePreference, sessionStatus, questions[], and responses[]', async () => {
      const { memberId, sessionId, token } = await seedValidScenario();

      const request = makeRequest(token);
      const response = await GET(request, makeContext(token));

      expect(response.status).toBe(200);
      const body = await response.json();

      // Requirement 3.1: Response contains all required fields
      expect(body.memberId).toBe(memberId);
      expect(body.sessionId).toBe(sessionId);
      expect(body.memberName).toMatch(/^Alice Test \d+$/);
      expect(body.cadencePreference).toBe('weekly');
      expect(body.sessionStatus).toBe('open');

      // Questions array with expected shape
      expect(body.questions).toBeInstanceOf(Array);
      expect(body.questions.length).toBeGreaterThan(0);
      expect(body.questions[0]).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        displayOrder: expect.any(Number),
      });

      // Responses array (empty since no responses submitted)
      expect(body.responses).toBeInstanceOf(Array);
      expect(body.responses).toHaveLength(0);
    });

    it('response includes Set-Cookie header with session-scoped max-age', async () => {
      const closesAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
      const { token } = await seedValidScenario({ closesAt });

      const request = makeRequest(token);
      const response = await GET(request, makeContext(token));

      expect(response.status).toBe(200);

      // Requirement 3.4: Set-Cookie header is present
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain('session=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=lax');

      // Requirement 3.5: Max-Age is scoped to session close time (≤ remaining time)
      const maxAgeMatch = setCookie!.match(/Max-Age=(\d+)/);
      expect(maxAgeMatch).not.toBeNull();
      const maxAge = parseInt(maxAgeMatch![1], 10);
      const expectedMaxSeconds = Math.floor((closesAt.getTime() - Date.now()) / 1000);
      // Should be close to the remaining time (within 5s tolerance for test execution)
      expect(maxAge).toBeLessThanOrEqual(expectedMaxSeconds + 5);
      expect(maxAge).toBeGreaterThan(0);
    });

    it('closed session returns sessionStatus "closed"', async () => {
      const { token } = await seedValidScenario({ sessionStatus: 'closed' });

      const request = makeRequest(token);
      const response = await GET(request, makeContext(token));

      expect(response.status).toBe(200);
      const body = await response.json();

      // Requirement 3.3: sessionStatus reflects closed state
      expect(body.sessionStatus).toBe('closed');
    });

    it('includes existing responses for the member in that session', async () => {
      const { memberId, sessionId, token } = await seedValidScenario();

      // Seed a response for this member/session
      await repos.response.upsert({
        memberId,
        sessionId,
        questionId: 'q-delivering-value',
        score: 4,
        trendIndicator: 'improving',
      });

      const request = makeRequest(token);
      const response = await GET(request, makeContext(token));

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.responses).toHaveLength(1);
      expect(body.responses[0]).toMatchObject({
        questionId: 'q-delivering-value',
        score: 4,
        trendIndicator: 'improving',
      });
    });

    it('reuses an existing valid UserSession instead of creating a new one', async () => {
      const { memberId, token } = await seedValidScenario();

      // Pre-create a valid UserSession for this member
      const existingSession = await repos.userSession.create({
        memberId,
        token: 'existing-session-token-abc',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      const request = makeRequest(token);
      const response = await GET(request, makeContext(token));

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain(`session=${existingSession.token}`);
    });
  });
});
