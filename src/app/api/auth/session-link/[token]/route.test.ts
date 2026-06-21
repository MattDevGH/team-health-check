import { describe, it, expect, beforeEach } from 'vitest';
import { resetRateLimitStore } from '@/lib/rate-limit';

// We import after resetting rate limit store, so module-level state is clean
import { GET, _testRepos as repos } from './route';

/**
 * Tests for GET /api/auth/session-link/[token]
 * Requirements: 6.3, 6.4, 6.7
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
});
