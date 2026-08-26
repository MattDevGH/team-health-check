/**
 * POST /api/me/delete-data — GDPR self-service data deletion
 *
 * Requirements: NFR 4.3, 2.1, 2.4
 * Thin route handler: requires confirmation, delegates to response service.
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

  if (body.confirm !== true) {
    throw new ValidationError([
      {
        field: 'confirm',
        message: 'Confirmation required. Set confirm: true to proceed with data deletion.',
        code: 'CONFIRMATION_REQUIRED',
      },
    ]);
  }

  await container.response.deleteMyData(auth.memberId);
  return Response.json({ success: true, message: 'All personal response data has been deleted' });
});
