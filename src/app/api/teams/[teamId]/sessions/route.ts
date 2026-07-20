/**
 * GET /api/teams/[teamId]/sessions — List sessions for a team
 * POST /api/teams/[teamId]/sessions — Manually open a new session
 *
 * Requirements: 3.5, 3.10, 9.1, 9.2, 19.2
 * Thin route handler: validate input, enforce auth + team membership, call service, format response.
 * Uses cookie-based auth via getAuthContext + authorizeTeamMember.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });

/**
 * GET — List all sessions for the given team.
 * Requirement 3.10: Manual session management when no schedule is configured.
 */
export const GET = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await authorizeTeamMember(auth.memberId, teamId);

  const sessions = await repos.session.findByTeamId(teamId);
  return Response.json(sessions);
});

/**
 * POST — Manually open a new health check session.
 * Requirement 3.5: Allow a user to manually open a session.
 * Requirement 19.2: Enforce delivery_manager role.
 */
export const POST = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await authorizeTeamMember(auth.memberId, teamId);

  // Enforce delivery_manager role
  await container.permission.requireRole(teamId, auth.memberId, 'delivery_manager');

  // Open session (closes any existing open session automatically)
  const session = await container.session.open(teamId, auth.memberId);

  return Response.json(session, { status: 201 });
});
