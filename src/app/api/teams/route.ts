/**
 * POST /api/teams — Create a new team
 * GET /api/teams — List all teams
 *
 * Requirements: 1.1, 1.2, 20.1
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { createTeamSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json();

  // Validate input
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || undefined,
        message: i.message,
        code: i.code,
      }))
    );
  }

  // TODO: Extract userId from auth session (for now, use placeholder)
  // Will be replaced with real auth in later task
  const userId = 'anonymous';

  const team = await container.team.create(
    parsed.data.name,
    parsed.data.description,
    userId
  );

  return Response.json(team, { status: 201 });
});

export const GET = withErrorHandling(async () => {
  const teams = await container.team.listTeams();
  return Response.json(teams);
});
