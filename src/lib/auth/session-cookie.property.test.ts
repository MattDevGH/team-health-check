/**
 * Property Test: Cookie attributes are environment-correct
 *
 * Feature: integration-hardening, Property 1: Cookie attributes are environment-correct
 *
 * **Validates: Requirements 1.1, 1.5**
 *
 * For any session token and any environment configuration (NODE_ENV, NEXT_PUBLIC_APP_URL),
 * the generated Set-Cookie header SHALL always include HttpOnly, SameSite=Lax, and a
 * positive Max-Age; and SHALL include Secure if and only if NODE_ENV is "production"
 * OR NEXT_PUBLIC_APP_URL starts with "https://".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

import { buildSetCookieHeader } from './session-cookie';

/**
 * Arbitrary for NODE_ENV values — includes production and various non-production values.
 */
const nodeEnvArb = fc.oneof(
  fc.constant('production'),
  fc.constant('development'),
  fc.constant('test'),
  fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/)
);

/**
 * Arbitrary for NEXT_PUBLIC_APP_URL — generates both https:// and http:// URLs,
 * plus undefined (unset) scenarios.
 */
const appUrlArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/)
  ).map(([host]) => `https://${host}.example.com`),
  fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/)
  ).map(([host]) => `http://${host}.example.com`),
  fc.constant('http://localhost:3000'),
  fc.constant('https://my-app.vercel.app'),
  fc.constant(undefined)
);

/**
 * Arbitrary for session token strings — non-empty alphanumeric + UUID-like tokens.
 */
const tokenArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/);

/**
 * Arbitrary for optional custom maxAge (positive integer or undefined for default).
 */
const maxAgeArb = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 1, max: 365 * 24 * 60 * 60 })
);

describe('Property 1: Cookie attributes are environment-correct', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always includes HttpOnly, SameSite=Lax, and positive Max-Age', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        nodeEnvArb,
        appUrlArb,
        maxAgeArb,
        async (token, nodeEnv, appUrl, maxAge) => {
          // Set environment
          vi.stubEnv('NODE_ENV', nodeEnv);
          if (appUrl !== undefined) {
            vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
          } else {
            delete process.env.NEXT_PUBLIC_APP_URL;
          }

          const header = buildSetCookieHeader(token, maxAge);

          // HttpOnly must always be present
          expect(header).toContain('HttpOnly');

          // SameSite=lax must always be present
          expect(header).toContain('SameSite=lax');

          // Max-Age must be present and positive
          const maxAgeMatch = header.match(/Max-Age=(\d+)/);
          expect(maxAgeMatch).not.toBeNull();
          const parsedMaxAge = parseInt(maxAgeMatch![1], 10);
          expect(parsedMaxAge).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('includes Secure iff NODE_ENV=production OR URL starts with https://', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        nodeEnvArb,
        appUrlArb,
        maxAgeArb,
        async (token, nodeEnv, appUrl, maxAge) => {
          // Set environment
          vi.stubEnv('NODE_ENV', nodeEnv);
          if (appUrl !== undefined) {
            vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
          } else {
            delete process.env.NEXT_PUBLIC_APP_URL;
          }

          const header = buildSetCookieHeader(token, maxAge);

          const shouldBeSecure =
            nodeEnv === 'production' ||
            (appUrl ?? '').startsWith('https://');

          if (shouldBeSecure) {
            expect(header).toContain('Secure');
          } else {
            expect(header).not.toContain('Secure');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
