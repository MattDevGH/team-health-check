/**
 * GET /api/teams/[teamId]/export — Download authorized team trend data as CSV.
 * Requirements: Integration 2.1, 2.6, 9.1-9.3; Original 8.9, 20.6.
 */

import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';

import { createTeamExportRouteHandler } from './route-handlers';

export const GET = createTeamExportRouteHandler({
  getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
  authorizeTeamMember: createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember }),
  exportCSV: container.trend.exportCSV,
});
