/**
 * GET /api/teams/[teamId]/sessions/[sessionId]/participation
 * Requirements: 11.1–11.6
 */

import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';
import { createParticipationRouteHandler } from './route-handlers';

export const GET = createParticipationRouteHandler({
  getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
  authorizeTeamMember: createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember }),
  getParticipation: container.participation.get,
});
