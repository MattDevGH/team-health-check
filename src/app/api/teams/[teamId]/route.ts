/**
 * GET /api/teams/[teamId] — Get team details
 * PATCH /api/teams/[teamId] — Update team name/description
 * DELETE /api/teams/[teamId] — Archive team (soft delete)
 *
 * Requirements: 1.8, 2.1, 2.3, 9.1, 9.2, 19.2
 * Thin route handler: validate input, enforce auth + team membership, call service, format response.
 * Uses cookie-based auth via getAuthContext + authorizeTeamMember.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { updateTeamSchema } from '@/lib/validation/schemas';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });

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

  const team = await container.team.findById(teamId);
  if (!team) throw new NotFoundError('Team not found');
  return Response.json(team);
});

export const PATCH = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  await authorizeTeamMember(auth.memberId, teamId);

  const body = await request.json();

  // Validate input with Zod schema
  const parsed = updateTeamSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || undefined,
        message: i.message,
        code: i.code,
      }))
    );
  }

  // Enforce delivery_manager role
  await container.permission.requireRole(teamId, auth.memberId, 'delivery_manager');

  const updatedTeam = await container.team.update(teamId, {
    name: parsed.data.name,
    description: parsed.data.description,
  });

  return Response.json(updatedTeam);
});

export const DELETE = withErrorHandling(async (request: Request, context) => {
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

  await container.team.archive(teamId, auth.memberId);

  return Response.json({ archived: true });
});
