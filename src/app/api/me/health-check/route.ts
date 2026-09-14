/**
 * GET /api/me/health-check — the signed-in member's own open health check.
 *
 * Requirements: Reaching Your Health Check 1.3, 1.6, 2.1
 *
 * Takes no parameters, deliberately. The member comes from `AuthContext`, so
 * there is nothing a caller can send to ask for someone else's session link —
 * and a session link authenticates whoever holds it.
 *
 * Thin: authenticate, call the service, shape the response.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createMyHealthCheckService } from '@/lib/services/my-health-check.service';

// Test seam: lets route tests seed data through the same repositories
export { repos as _testRepos };

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

const myHealthCheck = createMyHealthCheckService({
  sessionRepo: repos.session,
  sessionLinkRepo: repos.sessionLink,
  teamMemberRepo: repos.teamMember,
});

export const GET = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const result = await myHealthCheck.resolve(auth.memberId);

  /*
   * Every outcome is a 200 describing a state, not an error.
   *
   * "No check is open" is an ordinary answer to an ordinary question, and a 404
   * would make the caller guess whether the route was missing, the member was
   * unknown, or there was simply nothing to answer today.
   */
  return Response.json(result);
});
