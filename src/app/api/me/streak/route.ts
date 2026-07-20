/**
 * GET /api/me/streak — Get current participation streak
 *
 * Requirements: 17.1, 2.1, 2.4
 * Thin route handler: extract member ID from auth context, delegate to streak service.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

export const GET = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const streak = await container.streak.calculate(auth.memberId);
  return Response.json(streak);
});
