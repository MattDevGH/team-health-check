/**
 * GET /api/auth/magic-link/verify/[token] — Verify a magic link token
 *
 * Requirements: 1.1, 1.5, 7.2, 7.4, 7.9
 * - Atomic CAS claim (single-use token)
 * - Returns authenticated state or genesis state for new users
 * - Expired/used tokens return 404 via NotFoundError from service
 * - Sets session cookie on successful authentication (not on genesis)
 * - Thin route handler: extract param, call service, format response
 */

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { buildSetCookieHeader } from '@/lib/auth/session-cookie';

// Test seam: allows route tests to seed data via repos
export const _testContainer = { _repos: repos };

export const GET = withErrorHandling(async (request, context) => {
  const { token } = await context!.params;

  const result = await container.auth.verifyMagicLink(token);

  // Only set cookie for authenticated result (not genesis flow)
  if (result.status === 'authenticated') {
    const response = Response.json(result);
    response.headers.set('Set-Cookie', buildSetCookieHeader(result.sessionToken));
    return response;
  }

  return Response.json(result);
});
