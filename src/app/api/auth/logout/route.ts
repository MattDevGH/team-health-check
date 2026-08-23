/**
 * POST /api/auth/logout — Revoke the presented session and clear its cookie.
 *
 * Integration Requirement 1.6. Missing, unknown, and expired tokens remain
 * idempotent so stale browser state can always be cleared without token leakage.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { buildClearCookieHeader, COOKIE_NAME } from '@/lib/auth/session-cookie';
import { container } from '@/lib/container-production';

export const POST = withErrorHandling(async (request: Request) => {
  const token = (request as NextRequest).cookies.get(COOKIE_NAME)?.value;
  if (token) {
    await container.auth.invalidateSession(token);
  }

  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': buildClearCookieHeader() },
  });
});
