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

  const member = await repos.teamMember.findById(auth.memberId);
  if (!member) {
    throw new NotFoundError('Member not found');
  }

  const slackIdentityLink = await repos.slackIdentityLink.findByMemberId(auth.memberId);
  const slackLink = slackIdentityLink ? { slackUserId: slackIdentityLink.slackUserId } : null;

  // Prisma enforces the team foreign key, so an unresolvable team is
  // unreachable in production. When it cannot be resolved the shell is told
  // nothing rather than being handed an id it cannot name.
  const teamRecord = await repos.team.findById(member.teamId);
  const team = teamRecord ? { id: teamRecord.id, name: teamRecord.name } : null;

  const roles = team
    ? (await repos.teamMemberRole.findByMemberAndTeam(member.id, team.id)).map((r) => r.role)
    : [];

  return Response.json({ ...member, slackLink, team, roles });
});
