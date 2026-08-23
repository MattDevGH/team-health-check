/**
 * POST /api/auth/slack-pairing — Verify Slack pairing code
 *
 * Authenticates via the session cookie and verifies a pairing code for the
 * authenticated member. Returns { linked: true, slackUserId } on success.
 *
 * Requirements: 2.1, 2.4, 2.5, 7.1, 7.2, 9.3
 * Thin route handler: authenticate, validate input, call service, format response.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to access container/repos
export { container as _container, repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

export const POST = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const body = await request.json();

  if (!body.code || typeof body.code !== 'string') {
    throw new ValidationError([{ field: 'code', message: 'Pairing code is required', code: 'REQUIRED' }]);
  }

  const result = await container.auth.verifyPairingCode(auth.memberId, body.code);

  if (!result) {
    throw new NotFoundError('Invalid, expired, or already used pairing code');
  }

  return Response.json({ linked: true, slackUserId: result.slackUserId });
});
