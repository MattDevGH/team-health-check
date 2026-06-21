/**
 * PATCH /api/teams/[teamId]/members/[memberId] — Update a team member (placeholder)
 * DELETE /api/teams/[teamId]/members/[memberId] — Remove a team member
 *
 * Requirements: 1.6, 19.2
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

export const DELETE = withErrorHandling(async (request, context) => {
  const { teamId, memberId } = await context!.params;

  // TODO: Extract userId from auth session (placeholder until auth is wired)
  const userId = 'anonymous';

  // TODO: Enforce delivery_manager role for mutations once auth is wired
  // await container.permission.requireRole(teamId, userId, 'delivery_manager');

  await container.team.removeMember(teamId, memberId, userId);

  return Response.json({ removed: true });
});

export const PATCH = withErrorHandling(async () => {
  // Placeholder — member update logic will be implemented when requirements
  // for member field updates are defined (e.g., name, email, cadence preference).
  return Response.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } },
    { status: 501 }
  );
});
