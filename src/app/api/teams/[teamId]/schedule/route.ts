/**
 * GET/PUT /api/teams/[teamId]/schedule — retrieve or configure a team schedule.
 * Requirements: 2.1, 3.1, 9.1, 9.4, 20.6
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';
import { ValidationError } from '@/lib/errors';
import { scheduleSchema } from '@/lib/validation/schemas';

// Test seam: allows route tests to seed data via repos.
export { repos as _testRepos };

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });

export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }
  await authorizeTeamMember(auth.memberId, teamId);

  const schedule = await repos.teamSchedule.findByTeamId(teamId);
  return Response.json({ schedule });
});

export const PUT = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }
  await authorizeTeamMember(auth.memberId, teamId);
  await container.permission.requireRole(teamId, auth.memberId, 'delivery_manager');

  const parsed = scheduleSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      })),
    );
  }

  const result = await container.schedule.configure(teamId, parsed.data, auth.memberId);
  return Response.json(result);
});
