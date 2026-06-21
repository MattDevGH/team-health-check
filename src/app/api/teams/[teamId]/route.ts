/**
 * GET /api/teams/[teamId] — Get team details
 * PATCH /api/teams/[teamId] — Update team name/description
 * DELETE /api/teams/[teamId] — Archive team (soft delete)
 *
 * Requirements: 1.8, 19.2
 * Thin route handler: validate input, enforce role, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { updateTeamSchema } from '@/lib/validation/schemas';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const team = await container.team.findById(teamId);
  if (!team) throw new NotFoundError('Team not found');
  return Response.json(team);
});

export const PATCH = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
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
  const userId = request.headers.get('x-user-id') ?? '';
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  const updatedTeam = await container.team.update(teamId, {
    name: parsed.data.name,
    description: parsed.data.description,
  });

  return Response.json(updatedTeam);
});

export const DELETE = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;

  // Enforce delivery_manager role
  const userId = request.headers.get('x-user-id') ?? '';
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  await container.team.archive(teamId, userId);

  return Response.json({ archived: true });
});
