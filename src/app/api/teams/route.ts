/**
 * POST /api/teams — Create a team for the authenticated identity.
 * GET /api/teams — List the authenticated member's team.
 *
 * Requirements: Integration 2.1, 2.6; Original 1.1, 1.2, 20.1.
 */

import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';

import { createTeamRouteHandlers } from './route-handlers';

const handlers = createTeamRouteHandlers({
  getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
  teamService: container.team,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
