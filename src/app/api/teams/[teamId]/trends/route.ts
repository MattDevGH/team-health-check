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
 * - questions[]: the fixed catalogue, so the dashboard can name every question
 *   theme — including one nobody has answered — and show the question text
 *   behind it. Derived from the data, absence would be unrepresentable.
 *
 * Sessions are ordered chronologically (oldest first) per Requirement 4.3.
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { loadTrendInputs } from '@/lib/services/trend-inputs.service';

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

  /*
   * Four reads, together.
   *
   * The privacy mode, the question catalogue, the sessions and their
   * averages were awaited one after another, and given a team id none of
   * them needs any of the others. Deliberately after the authorisation
   * check above: reads about a team the member may not belong to should not
   * be in flight while the check that says so is still running.
   *
   * The question catalogue is five fixed rows, the same for every team, sent
   * with this response because the dashboard already makes this request and
   * needs it to name a theme that has no aggregates — previously such a
   * theme did not exist as far as the page was concerned.
   */
  const { privacyMode, questions: catalogue, sessions: allSessions, averages } =
    await loadTrendInputs(
      {
        getPrivacyMode: id => container.privacy.getMode(id),
        findQuestions: () => repos.question.findAll(),
        findSessions: id => repos.session.findByTeamId(id),
        getSessionAverages: id => container.trend.getSessionAverages(id),
      },
      teamId,
    );

  const questions = catalogue.map(question => ({
    id: question.id,
    title: question.title,
    description: question.description,
  }));

  const closedSessions = allSessions.filter(s => s.status === 'closed' && s.actualCloseAt);

  // Sort closed sessions chronologically (oldest first)
  closedSessions.sort((a, b) => a.actualCloseAt!.getTime() - b.actualCloseAt!.getTime());

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

  /*
   * A trend needs two points; a result needs one.
   *
   * These were conflated: fewer than two closed sessions returned no sessions
   * at all, so a team that had closed exactly one check was told "more data
   * needed" — a statement about trends — and shown no scores. That is what a
   * delivery manager saw on production after closing their first check, and it
   * made every explanation on the panels below unreachable for precisely the
   * team most likely to need one. requiresMoreData still says what it said;
   * the session is no longer withheld with it.
   */
  const requiresMoreData = closedSessions.length < 2;

  // Build sessions array matching the frontend contract
  const sessions = closedSessions.map(session => ({
    sessionId: session.id,
    closedAt: session.actualCloseAt!.toISOString(),
    /*
     * Whether the aggregates were computed, not merely whether they exist.
     *
     * Zero aggregates means "nobody answered" or "not computed yet", and those
     * are different news — one resolves in minutes, the other never. Without
     * this the dashboard could only guess from the clock, and a stalled
     * scheduler would have it report that a team ignored a check.
     */
    materialisedAt: session.materialisedAt ? session.materialisedAt.toISOString() : null,
    averages: averagesBySession.get(session.id) ?? [],
  }));

  /*
   * Trend indicators for the most recent closed session.
   *
   * Computed for a single session too, because an indicator is what a
   * respondent said about their own direction rather than a comparison
   * between sessions. One closed check has them; it just has no line to draw.
   */
  const mostRecentSession = closedSessions[closedSessions.length - 1];
  const rawDistribution = mostRecentSession
    ? await container.trend.getTrendIndicatorDistribution(mostRecentSession.id)
    : [];
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
    questions,
    // Omitted rather than false when trends can be drawn, which is the shape
    // the dashboard and its mock have always agreed on.
    ...(requiresMoreData ? { requiresMoreData: true } : {}),
  });
});
