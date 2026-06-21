/**
 * GET /api/teams/[teamId]/audit-log — Paginated audit log retrieval
 *
 * Requirements: 18.4, 18.5, 19.2
 * - 18.4: Retrieve audit log entries for a team (most recent first)
 * - 18.5: Cursor-based pagination support
 * - 19.2: delivery_manager role enforcement
 *
 * Thin route handler: enforce role, parse pagination, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;

  // Enforce delivery_manager role (Requirement 19.2)
  const userId = request.headers.get('x-user-id') ?? '';
  await container.permission.requireRole(teamId, userId, 'delivery_manager');

  // Parse pagination params from URL (Requirement 18.5)
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!, 10)
    : undefined;

  // Get audit log (most recent first — Requirement 18.4)
  const entries = await container.auditLog.getLog(teamId, { cursor, limit });

  return Response.json(entries);
});
