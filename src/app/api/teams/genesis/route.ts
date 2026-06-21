/**
 * POST /api/teams/genesis — create team from magic link (genesis flow).
 * Requirement 7.9: Unknown email creates new team with delivery_manager role.
 *
 * Thin route handler: validates input, delegates to genesis service.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json();

  if (!body.token || typeof body.token !== 'string') {
    throw new ValidationError([
      { field: 'token', message: 'Token is required', code: 'REQUIRED' },
    ]);
  }

  const result = await container.genesis.executeGenesis(body.token);

  return Response.json(result, { status: 201 });
});
