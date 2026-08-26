/**
 * GET /api/teams/[teamId]/audit-log — Paginated audit log retrieval
 *
 * Requirements: 9.4, 18.4, 18.5, 19.2
 * - 9.4: delivery_manager role enforcement for audit-log
 * - 18.4: Retrieve audit log entries for a team (most recent first)
 * - 18.5: Cursor-based pagination support
 * - 19.2: delivery_manager role enforcement
 *
 * Thin route handler: enforce auth + delivery_manager role, parse pagination, call service, format response.
 * Uses cookie-based auth via getAuthContext + authorizeDeliveryManager.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeDeliveryManager } from '@/lib/auth/authorize-team-member';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeDeliveryManager = createAuthorizeDeliveryManager({
  teamMemberRepo: repos.teamMember,
  teamMemberRoleRepo: repos.teamMemberRole,
});

export const GET = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  // Enforce delivery_manager role (Requirement 9.4, 19.2)
  await authorizeDeliveryManager(auth.memberId, teamId);

  // Parse pagination params from URL (Requirement 18.5)
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;

  // Get audit log (most recent first — Requirement 18.4)
  const entries = await container.auditLog.getLog(teamId, { cursor, limit });

  return Response.json(entries);
});
