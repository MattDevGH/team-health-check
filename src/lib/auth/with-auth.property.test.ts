/**
 * Property Tests for Auth Helper (with-auth.ts)
 *
 * Feature: integration-hardening, Property 3: Auth helper rejects invalid sessions
 *
 * **Validates: Requirements 1.4, 2.6, 9.3**
 *
 * For any request where the session cookie is missing, contains a token not present
 * in UserSession, or contains a token whose expiresAt is in the past,
 * `getAuthContext` SHALL return null.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';

import { createGetAuthContext } from './with-auth';
import { InMemoryUserSessionRepository } from '@/lib/repositories/in-memory/user-session.repository';

/**
 * Arbitrary for session token strings — non-empty alphanumeric + UUID-like tokens.
 */
const tokenArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/);

/**
 * Arbitrary for memberId strings — UUID-like identifiers.
 */
const memberIdArb = fc.stringMatching(/^mem_[a-z0-9]{8,16}$/);

/**
 * Arbitrary for expired dates — always in the past.
 */
const expiredDateArb = fc.date({
  min: new Date('2020-01-01'),
  max: new Date(Date.now() - 1000), // At least 1 second in the past
  noInvalidDate: true,
});

/**
 * Helper to build a NextRequest with an optional session cookie.
 */
function buildRequest(sessionToken?: string): NextRequest {
  const url = 'http://localhost:3000/api/me';
  const headers = new Headers();
  if (sessionToken) {
    headers.set('cookie', `session=${sessionToken}`);
  }
  return new NextRequest(url, { headers });
}

describe('Property 3: Auth helper rejects invalid sessions', () => {
  it('returns null when session cookie is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberIdArb,
        tokenArb,
        async (memberId, storedToken) => {
          const userSessionRepo = new InMemoryUserSessionRepository();

          // Seed a valid session in the repo (to prove it's not just empty-repo behavior)
          await userSessionRepo.create({
            memberId,
            token: storedToken,
            expiresAt: new Date(Date.now() + 3600_000), // 1 hour in future
          });

          const getAuthContext = createGetAuthContext({ userSessionRepo });

          // Request with no session cookie
          const request = buildRequest(undefined);
          const result = await getAuthContext(request);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when token is not present in UserSession repository', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberIdArb,
        tokenArb,
        tokenArb,
        async (memberId, storedToken, requestToken) => {
          // Ensure the request token differs from the stored token
          fc.pre(requestToken !== storedToken);

          const userSessionRepo = new InMemoryUserSessionRepository();

          // Seed a valid session with a different token
          await userSessionRepo.create({
            memberId,
            token: storedToken,
            expiresAt: new Date(Date.now() + 3600_000),
          });

          const getAuthContext = createGetAuthContext({ userSessionRepo });

          // Request with an unknown token
          const request = buildRequest(requestToken);
          const result = await getAuthContext(request);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when token exists but session is expired', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberIdArb,
        tokenArb,
        expiredDateArb,
        async (memberId, token, expiredAt) => {
          const userSessionRepo = new InMemoryUserSessionRepository();

          // Create a session that has already expired
          await userSessionRepo.create({
            memberId,
            token,
            expiresAt: expiredAt,
          });

          const getAuthContext = createGetAuthContext({ userSessionRepo });

          // Request with the expired session's token
          const request = buildRequest(token);
          const result = await getAuthContext(request);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
