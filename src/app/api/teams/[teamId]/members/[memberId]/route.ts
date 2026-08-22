/** Authenticated delivery-manager member mutation routes. Requirements: 1.6, 19.1-19.9. */
import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { createAuthorizeDeliveryManager } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { container, repos } from '@/lib/container-production';
import { ValidationError } from '@/lib/errors';
import { memberRoleSchema } from '@/lib/validation/schemas';

export { repos as _repos };

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeDeliveryManager = createAuthorizeDeliveryManager({
  teamMemberRepo: repos.teamMember,
  teamMemberRoleRepo: repos.teamMemberRole,
});

function unauthorized(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );
}

export const PATCH = withErrorHandling(async (request, context) => {
  const { teamId, memberId } = await context!.params;
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) return unauthorized();
  await authorizeDeliveryManager(auth.memberId, teamId);

  const parsed = memberRoleSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      message: issue.message,
      code: issue.code,
    })));
  }

  const member = await container.team.updateMemberRole(
    teamId,
    memberId,
    parsed.data.role,
    auth.memberId,
  );
  return Response.json(member);
});

export const DELETE = withErrorHandling(async (request, context) => {
  const { teamId, memberId } = await context!.params;
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) return unauthorized();
  await authorizeDeliveryManager(auth.memberId, teamId);

  await container.team.removeMember(teamId, memberId, auth.memberId);
  return Response.json({ removed: true });
});
