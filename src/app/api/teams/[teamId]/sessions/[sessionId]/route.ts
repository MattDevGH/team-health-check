/**
 * GET /api/teams/[teamId]/sessions/[sessionId] — Get session details
 * PATCH /api/teams/[teamId]/sessions/[sessionId] — Close a session
 *
 * Requirements: 3.5, 3.9, 19.2
 * Thin route handler: validate input, enforce role, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

/**
 * GET — Retrieve details for a specific session.
 */
export const GET = withErrorHandling(async (_request, context) => {
  const { sessionId } = await context!.params;

  const session = await repos.session.findById(sessionId);
  if (!session) {
    throw new NotFoundError('Session not found');
  }

  return Response.json(session);
});

/**
 * PATCH — Close a health check session.
 * Requirement 3.5: Allow a user to manually close a session.
 * Requirement 3.9: Reject close if session is already closed.
 * Requirement 19.2: Enforce delivery_manager role.
 */
export const PATCH = withErrorHandling(async (request, context) => {
  const { teamId, sessionId } = await context!.params;

  // Extract userId from x-user-id header (placeholder auth)
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    throw new ForbiddenError('Missing x-user-id header');
  }

  // Enforce delivery_manager role
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  // Close session (throws NotFoundError or ConflictError as appropriate)
  await container.session.close(sessionId, userId);

  return Response.json({ closed: true });
});
