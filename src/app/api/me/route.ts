/**
 * GET /api/me — Current user profile
 *
 * Requirements: 13.1, 15.1
 * Thin route handler: extract member ID from header, return profile.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
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

  const member = await repos.teamMember.findById(memberId);
  if (!member) {
    throw new NotFoundError('Member not found');
  }

  return Response.json(member);
});
