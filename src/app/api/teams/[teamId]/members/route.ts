/**
 * GET /api/teams/[teamId]/members — List team members
 * POST /api/teams/[teamId]/members — Add a team member
 *
 * Requirements: 1.3, 1.4, 1.5, 1.7, 19.2
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { addMemberSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const members = await container.team.getMembers(teamId);
  return Response.json(members);
});

export const POST = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
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

  // TODO: Enforce delivery_manager role for mutations once auth is wired
  // await container.permission.requireRole(teamId, userId, 'delivery_manager');

  const member = await container.team.addMember(
    teamId,
    parsed.data.name,
    parsed.data.email
  );

  return Response.json(member, { status: 201 });
});
