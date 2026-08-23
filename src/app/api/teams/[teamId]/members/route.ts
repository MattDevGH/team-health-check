/**
 * GET /api/teams/[teamId]/members — List team members
 * POST /api/teams/[teamId]/members — Add a team member
 *
 * Requirements: 1.3, 1.4, 1.5, 1.7, 9.1, 9.2, 19.2
 * Thin route handler: validate input, enforce auth + team membership, call service, format response.
 * Uses cookie-based auth via getAuthContext + authorizeTeamMember.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { addMemberSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeDeliveryManager, createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });
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

  await authorizeTeamMember(auth.memberId, teamId);

  const members = await container.team.getMembers(teamId);
  return Response.json(members);
});

export const POST = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await authorizeDeliveryManager(auth.memberId, teamId);

  const body = await request.json();

  // Validate input with Zod schema
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || undefined,
        message: i.message,
        code: i.code,
      }))
    );
  }

  const member = await container.team.addMember(
    teamId,
    parsed.data.name,
    parsed.data.email,
    auth.memberId,
  );

  return Response.json(member, { status: 201 });
});
