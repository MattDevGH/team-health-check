/**
 * GET /api/teams/[teamId]/sessions/[sessionId]/participation
 *
 * Returns participation data: responded count, total count, and non-responder names.
 * Non-responder name visibility is governed by privacy mode and user role.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

/**
 * GET — Retrieve participation data for a session.
 *
 * Req 11.1: Display responded count and total count.
 * Req 11.2: In anonymous mode, non-responder names visible only to delivery_manager.
 * Req 11.3: In attributed mode, non-responder names visible to all team members.
 * Req 11.4: Never reveal individual scores or trend indicators.
 * Req 11.5: Works for both open and closed sessions.
 * Req 11.6: Restricted to users belonging to the same team.
 */
export const GET = withErrorHandling(async (request, context) => {
  const { teamId, sessionId } = await context!.params;

  // Req 11.6: Require authenticated user
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    throw new ForbiddenError('Missing x-user-id header');
  }

  // Req 11.6: Verify user belongs to this team
  const members = await repos.teamMember.findByTeamId(teamId);
  const isTeamMember = members.some(m => m.id === userId);
  if (!isTeamMember) {
    throw new ForbiddenError('User is not a member of this team');
  }

  // Verify session exists
  const session = await repos.session.findById(sessionId);
  if (!session) {
    throw new NotFoundError('Session not found');
  }

  // 1. Get all responses for this session
  const responses = await repos.response.findBySession(sessionId);

  // 2. Determine who responded (unique memberIds)
  const respondedMemberIds = new Set(responses.map(r => r.memberId));

  // 3. Build participation counts (Req 11.1)
  const totalCount = members.length;
  const respondedCount = respondedMemberIds.size;

  // 4. Determine non-responders
  const nonResponders = members.filter(m => !respondedMemberIds.has(m.id));

  // 5. Apply privacy rules (Req 11.2, 11.3)
  const team = await repos.team.findById(teamId);
  let nonRespondersResult: Array<{ id: string; name: string }> = [];

  if (team?.privacyMode === 'attributed') {
    // Req 11.3: Attributed mode — all team members can see non-responder names
    nonRespondersResult = nonResponders.map(m => ({ id: m.id, name: m.name }));
  } else {
    // Req 11.2: Anonymous mode — only delivery_manager can see non-responder names
    const roles = await repos.teamMemberRole.findByMemberAndTeam(userId, teamId);
    const isDeliveryManager = roles.some(r => r.role === 'delivery_manager');
    if (isDeliveryManager) {
      nonRespondersResult = nonResponders.map(m => ({ id: m.id, name: m.name }));
    }
  }

  // Req 11.4: Never include individual scores or trend indicators
  return Response.json({
    totalCount,
    respondedCount,
    nonResponders: nonRespondersResult,
  });
});
