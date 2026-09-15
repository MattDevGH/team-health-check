/**
 * GET /api/me — Current user profile
 *
 * Requirements: 13.1, 15.1, 2.1, 2.4; Manager Experience 1.1, 1.3
 * Thin route handler: extract member ID from auth context, return profile.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 *
 * Also returns the member's team and roles, which the navigation shell uses to
 * build team-scoped links and to decide whether to offer Delivery-Manager-only
 * destinations. Sending them here avoids a second round trip on every page.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { resolveMemberProfile } from '@/lib/services/member-profile.service';
import { NotFoundError } from '@/lib/errors';
import { repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

export const GET = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  /*
   * Assembled by a service, which is where the four repository calls behind
   * this used to sit inline. Two of them now overlap, because the Slack link
   * and the team depend on the member and not on each other.
   */
  const profile = await resolveMemberProfile(
    {
      teamMemberRepo: repos.teamMember,
      slackIdentityLinkRepo: repos.slackIdentityLink,
      teamRepo: repos.team,
      teamMemberRoleRepo: repos.teamMemberRole,
    },
    auth.memberId,
  );

  if (!profile) throw new NotFoundError('Member not found');

  return Response.json(profile);
});
