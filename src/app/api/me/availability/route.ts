/**
 * GET /api/me/availability — The away periods this member has set
 * POST /api/me/availability — Mark member as away
 * DELETE /api/me/availability — Remove away status
 *
 * Requirements: 12.1, 12.7, 2.1, 2.4, Explaining Itself 5.1, 5.5
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

/**
 * Requirements: Explaining Itself 5.1, 5.5
 *
 * The service has had `getAvailability` since availability was built and no
 * route ever called it, so a member could set an away period and then never
 * see it again. The member id comes from the session and nowhere else: there
 * is no parameter here to pass somebody else's.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  return Response.json(await container.availability.getAvailability(auth.memberId));
});

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

  /*
   * Requirements: Explaining Itself 5.2, 5.5
   *
   * The member id comes from the session, and the service refuses anything
   * that is not theirs. This route used to pass the body's id straight to a
   * service that deleted whatever it named, so any signed-in member could
   * cancel any other member's away period given its id — and the member who
   * lost it would be prompted through a holiday with nothing to explain why.
   *
   * Success either way: a period that is not yours is treated as one that does
   * not exist, so nothing here says whether the id named anything.
   */
  await container.availability.removeAway(auth.memberId, body.availabilityId);
  return Response.json({ success: true });
});
