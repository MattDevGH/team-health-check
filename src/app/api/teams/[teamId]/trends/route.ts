/**
 * GET /api/teams/[teamId]/trends — Get trend data for a team
 *
 * Requirements: 4.1, 4.2, 4.3, 8.1, 9.1, 20.6
 * Thin route handler: auth + authorization, call service, reshape response to frontend contract.
 *
 * Response shape matches TrendsResponse contract:
 * - sessions[]: { sessionId, closedAt (ISO), averages[] }
 * - trendDistribution[]: array of { questionId, improving, stable, declining }
 * - requiresMoreData: true when fewer than 2 closed sessions
 * - privacyMode: team's privacy mode
 *
 * Sessions are ordered chronologically (oldest first) per Requirement 4.3.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';

// Test seam: allows route tests to seed data via repos
export { repos as _testRepos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember });

/**
 * GET — Return reshaped trend data for the team.
 * Requires cookie-based auth + team membership.
 */
export const GET = withErrorHandling(async (request: Request, context) => {
  const { teamId } = await context!.params;

  // Auth: validate session cookie
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  // Authorization: verify member belongs to team
  await authorizeTeamMember(auth.memberId, teamId);

  // Get privacy mode
  const privacyMode = await container.privacy.getMode(teamId);

  // Get all sessions for this team to identify closed ones
  const allSessions = await repos.session.findByTeamId(teamId);
  const closedSessions = allSessions.filter(s => s.status === 'closed' && s.actualCloseAt);

  // Fewer than 2 closed sessions → requiresMoreData
  if (closedSessions.length < 2) {
    return Response.json({
      sessions: [],
      trendDistribution: [],
      privacyMode,
      requiresMoreData: true,
    });
  }

  // Sort closed sessions chronologically (oldest first)
  closedSessions.sort((a, b) =>
    (a.actualCloseAt!.getTime()) - (b.actualCloseAt!.getTime())
  );

  // Get session averages from trend service
  const averages = await container.trend.getSessionAverages(teamId);

  // Group averages by sessionId
  const averagesBySession = new Map<string, Array<{ questionId: string; averageScore: number; responseCount: number }>>();
  for (const avg of averages) {
    if (!averagesBySession.has(avg.sessionId)) {
      averagesBySession.set(avg.sessionId, []);
    }
    averagesBySession.get(avg.sessionId)!.push({
      questionId: avg.questionId,
      averageScore: avg.averageScore ?? 0,
      responseCount: avg.responseCount,
    });
  }

  // Build sessions array matching the frontend contract
  const sessions = closedSessions.map(session => ({
    sessionId: session.id,
    closedAt: session.actualCloseAt!.toISOString(),
    averages: averagesBySession.get(session.id) ?? [],
  }));

  // Get trend distribution for the most recent closed session
  const mostRecentSession = closedSessions[closedSessions.length - 1];
  const rawDistribution = await container.trend.getTrendIndicatorDistribution(mostRecentSession.id);
  const trendDistribution = rawDistribution.map(d => ({
    questionId: d.questionId,
    improving: d.improvingCount,
    stable: d.stableCount,
    declining: d.decliningCount,
  }));

  return Response.json({
    sessions,
    trendDistribution,
    privacyMode,
  });
});
