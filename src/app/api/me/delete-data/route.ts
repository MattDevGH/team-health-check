/**
 * POST /api/me/delete-data — GDPR self-service data deletion
 *
 * Requirements: NFR 4.3
 * Thin route handler: requires confirmation, delegates to response service.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

export { repos as _repos, container as _container };

export const POST = withErrorHandling(async (request: Request) => {
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

  const body = await request.json();

  if (body.confirm !== true) {
    throw new ValidationError([
      {
        field: 'confirm',
        message: 'Confirmation required. Set confirm: true to proceed with data deletion.',
        code: 'CONFIRMATION_REQUIRED',
      },
    ]);
  }

  await container.response.deleteMyData(memberId);
  return Response.json({ success: true, message: 'All personal response data has been deleted' });
});
