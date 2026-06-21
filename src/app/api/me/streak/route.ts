/**
 * GET /api/me/streak — Get current participation streak
 *
 * Requirements: 17.1
 * Thin route handler: extract member ID, delegate to streak service.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

export { repos as _repos, container as _container };

export const GET = withErrorHandling(async (request: Request) => {
  const memberId = request.headers.get('x-member-id');
  if (!memberId) {
    throw new ValidationError([
      { field: 'x-member-id', message: 'Missing member ID header', code: 'MISSING_HEADER' },
    ]);
  }

  const streak = await container.streak.calculate(memberId);
  return Response.json(streak);
});
