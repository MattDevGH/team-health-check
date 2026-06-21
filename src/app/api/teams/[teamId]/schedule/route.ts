/**
 * GET /api/teams/[teamId]/schedule — Get schedule for a team
 * PUT /api/teams/[teamId]/schedule — Configure schedule for a team
 *
 * Requirements: 3.1, 20.6
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { scheduleSchema } from '@/lib/validation/schemas';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

/**
 * GET — Return the current schedule configuration for the team.
 * Requirement 3.1: Schedule configuration retrieval.
 */
export const GET = withErrorHandling(async (_request, context) => {
  const { teamId } = await context!.params;
  const schedule = await repos.teamSchedule.findByTeamId(teamId);

  if (!schedule) {
    return Response.json({ schedule: null });
  }

  return Response.json({ schedule });
});

/**
 * PUT — Configure (create or update) the team schedule.
 * Requirement 3.1: Delivery managers can configure session cadence.
 * Requires delivery_manager role.
 */
export const PUT = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;

  // Extract userId from x-user-id header (placeholder auth)
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    throw new ForbiddenError('Missing x-user-id header');
  }

  // Enforce delivery_manager role
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  const body = await request.json();

  // Validate input with Zod schema
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || undefined,
        message: i.message,
        code: i.code,
      }))
    );
  }

  const result = await container.schedule.configure(teamId, parsed.data);

  return Response.json(result);
});
