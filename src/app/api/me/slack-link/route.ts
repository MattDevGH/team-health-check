/**
 * DELETE /api/me/slack-link — Unlink Slack identity
 *
 * Requirements: 2.6, 2.1, 2.4, 9.3
 * Thin route handler: authenticate, delete the SlackIdentityLink record.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await repos.slackIdentityLink.delete(auth.memberId);
  return Response.json({ success: true, message: 'Slack identity unlinked' });
});
