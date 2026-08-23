/**
 * GET /api/teams/[teamId]/sessions/[sessionId] — Get session details
 * PATCH /api/teams/[teamId]/sessions/[sessionId] — Close a session
 *
 * Requirements: 3.5, 3.9, 19.2
 * Thin route handler: validate input, enforce role, call service, format response.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { createAuthorizeDeliveryManager, createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';
import { createSessionDetailRouteHandler } from './route-handlers';

// Test seam: allows route tests to seed data via repos
export { repos as _testRepos };

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });
const authorizeDeliveryManager = createAuthorizeDeliveryManager({
  teamMemberRepo: repos.teamMember,
  teamMemberRoleRepo: repos.teamMemberRole,
});

/**
 * GET — Retrieve details for a specific session.
 */
export const GET = createSessionDetailRouteHandler({
  getAuthContext,
  authorizeTeamMember,
  getSession: container.session.get,
});

/**
 * PATCH — Close a health check session.
 * Requirement 3.5: Allow a user to manually close a session.
 * Requirement 3.9: Reject close if session is already closed.
 * Requirement 19.2: Enforce delivery_manager role.
 */
export const PATCH = withErrorHandling(async (request, context) => {
  const { teamId, sessionId } = await context!.params;
  const auth = await getAuthContext(request as NextRequest);

  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await authorizeDeliveryManager(auth.memberId, teamId);
  await container.session.close(teamId, sessionId, auth.memberId);

  return Response.json({ closed: true });
});
