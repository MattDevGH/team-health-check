/**
 * GET /api/auth/session-link/[token] — Validate session link and return enriched member/session context
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.3, 6.4, 6.7
 * Thin route handler: extract token, apply rate limiting via AuthService, look up member details,
 * create/reuse UserSession, set cookie, return enriched response.
 */

import crypto from 'crypto';

import { withErrorHandling } from '@/lib/api-utils';
import { NotFoundError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { buildSetCookieHeader, SESSION_MAX_AGE } from '@/lib/auth/session-cookie';

// Test seam: allows route tests to seed data via repos
export { repos as _testRepos };

export const GET = withErrorHandling(async (request, context) => {
  const { token } = await context!.params;

  // Get IP for rate limiting
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  // Validate with rate limiting
  const result = await container.auth.validateSessionLinkWithRateLimit(token, ip);

  if (!result) {
    throw new NotFoundError('Invalid or expired session link');
  }

  const { memberId, sessionId } = result;

  // Look up member details
  const member = await repos.teamMember.findById(memberId);
  const memberName = member?.name ?? '';
  const cadencePreference = member?.cadencePreference ?? 'every_session';

  // Look up session to determine status and closesAt
  const session = await repos.session.findById(sessionId);
  const sessionStatus: 'open' | 'closed' = session?.status === 'closed' ? 'closed' : 'open';
  const scheduledCloseAt = session?.scheduledCloseAt ?? null;

  // Look up questions
  const questions = await repos.question.findAll();
  const formattedQuestions = questions.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    displayOrder: q.displayOrder,
  }));

  // Look up existing responses for this member in this session
  const existingResponses = await repos.response.findByMemberAndSession(memberId, sessionId);
  const formattedResponses = existingResponses.map(r => ({
    questionId: r.questionId,
    score: r.score,
    trendIndicator: r.trendIndicator,
  }));

  const selection = await container.questionSelection.selectForSessionLink(
    memberId,
    sessionId,
    cadencePreference,
    scheduledCloseAt,
  );
  const selectedIds = new Set(selection.questionIds);
  const selectedQuestions = formattedQuestions.filter(question => selectedIds.has(question.id));

  // Create or reuse a UserSession for this member (Requirement 3.4)
  const existingUserSession = await repos.userSession.findValidByMemberId(memberId);

  let sessionToken: string;
  let maxAge: number;

  if (existingUserSession) {
    sessionToken = existingUserSession.token;
    maxAge = Math.floor((existingUserSession.expiresAt.getTime() - Date.now()) / 1000);
  } else {
    // Requirement 3.5: Scope session to health-check session close or 7 days, whichever is shorter
    const sevenDaysMs = SESSION_MAX_AGE * 1000;
    const timeUntilClose = scheduledCloseAt
      ? scheduledCloseAt.getTime() - Date.now()
      : sevenDaysMs;
    const effectiveMaxMs = Math.min(timeUntilClose, sevenDaysMs);

    const expiresAt = new Date(Date.now() + effectiveMaxMs);
    sessionToken = crypto.randomUUID();
    maxAge = Math.floor(effectiveMaxMs / 1000);

    await repos.userSession.create({
      memberId,
      token: sessionToken,
      expiresAt,
    });
  }

  // Build enriched response
  const responseBody = {
    memberId,
    sessionId,
    memberName,
    cadencePreference,
    sessionStatus,
    questions: selectedQuestions,
    allQuestions: formattedQuestions,
    expandable: selection.expandable,
    responses: formattedResponses,
  };

  const response = Response.json(responseBody);
  response.headers.set('Set-Cookie', buildSetCookieHeader(sessionToken, maxAge));
  return response;
});
