/**
 * GET /api/teams/[teamId]/sessions — List sessions for a team
 * POST /api/teams/[teamId]/sessions — Manually open a new session
 *
 * Requirements: 3.5, 3.10, 19.2
 * Thin route handler: validate input, enforce role, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ForbiddenError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

/**
 * GET — List all sessions for the given team.
 * Requirement 3.10: Manual session management when no schedule is configured.
 */
export const GET = withErrorHandling(async (_request, context) => {
  const { teamId } = await context!.params;
  const sessions = await repos.session.findByTeamId(teamId);
  return Response.json(sessions);
});

/**
 * POST — Manually open a new health check session.
 * Requirement 3.5: Allow a user to manually open a session.
 * Requirement 19.2: Enforce delivery_manager role.
 */
export const POST = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;

  // Extract userId from x-user-id header (placeholder auth)
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    throw new ForbiddenError('Missing x-user-id header');
  }

  // Enforce delivery_manager role
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  // Open session (closes any existing open session automatically)
  const session = await container.session.open(teamId, userId);

  return Response.json(session, { status: 201 });
});
