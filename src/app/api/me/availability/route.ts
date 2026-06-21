/**
 * POST /api/me/availability — Mark member as away
 * DELETE /api/me/availability — Remove away status
 *
 * Requirements: 12.1, 12.7
 * Thin route handler: validate input, delegate to availability service.
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

  if (!body.awayFrom || !body.awayUntil) {
    throw new ValidationError([
      { field: 'awayFrom', message: 'awayFrom and awayUntil are required', code: 'MISSING_FIELD' },
    ]);
  }

  const awayFrom = new Date(body.awayFrom);
  const awayUntil = new Date(body.awayUntil);

  if (isNaN(awayFrom.getTime()) || isNaN(awayUntil.getTime())) {
    throw new ValidationError([
      { field: 'awayFrom', message: 'Invalid date format', code: 'INVALID_DATE' },
    ]);
  }

  if (awayUntil <= awayFrom) {
    throw new ValidationError([
      { field: 'awayUntil', message: 'awayUntil must be after awayFrom', code: 'INVALID_RANGE' },
    ]);
  }

  const availability = await container.availability.markAway(memberId, awayFrom, awayUntil);
  return Response.json(availability, { status: 201 });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  const memberId = request.headers.get('x-member-id');
  if (!memberId) {
    throw new ValidationError([
      { field: 'x-member-id', message: 'Missing member ID header', code: 'MISSING_HEADER' },
    ]);
  }

  const body = await request.json();

  if (!body.availabilityId) {
    throw new ValidationError([
      { field: 'availabilityId', message: 'availabilityId is required', code: 'MISSING_FIELD' },
    ]);
  }

  await container.availability.removeAway(body.availabilityId);
  return Response.json({ success: true });
});
