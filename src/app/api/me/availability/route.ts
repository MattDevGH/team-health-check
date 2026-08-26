/**
 * POST /api/me/availability — Mark member as away
 * DELETE /api/me/availability — Remove away status
 *
 * Requirements: 12.1, 12.7, 2.1, 2.4
 * Thin route handler: validate input, delegate to availability service.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

export const POST = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const member = await repos.teamMember.findById(auth.memberId);
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

  const availability = await container.availability.markAway(auth.memberId, awayFrom, awayUntil);
  return Response.json(availability, { status: 201 });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
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
