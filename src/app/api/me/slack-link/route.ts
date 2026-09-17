/**
 * DELETE /api/me/slack-link — Unlink Slack identity
 *
 * Requirements: 2.6, 2.1, 2.4, 9.3; Slack Sign In 2.3, NFR 2.1
 * Thin route handler: authenticate, delegate to the service.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
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

  /*
   * Through the service, because unlinking is audited.
   *
   * This deleted straight from the repository and wrote nothing, so a member
   * unlinking themselves left no trace — found on 2026-09-17 by reading a real
   * audit log, which showed an account linked twice and never unlinked.
   */
  await container.auth.unlinkSlackAccount(auth.memberId);
  return Response.json({ success: true, message: 'Slack identity unlinked' });
});
