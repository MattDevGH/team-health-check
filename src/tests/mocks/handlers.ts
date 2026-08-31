/**
 * MSW handlers aligned to actual API contracts post-integration-hardening.
 *
 * Requirements: 12.1, 12.4
 *
 * These default handlers provide baseline mock responses matching the new API shapes.
 * Individual tests can override via server.use(...) as needed.
 */
import { http, HttpResponse } from 'msw';

/**
 * Default questions used across session-link and response handlers.
 */
const DEFAULT_QUESTIONS = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well is the team delivering value?', displayOrder: 1 },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How effectively does the team work together?', displayOrder: 2 },
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it to get work done?', displayOrder: 3 },
  { id: 'q-learning-improving', title: 'Learning and Improving', description: 'How well does the team learn and improve?', displayOrder: 4 },
  { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe do team members feel to speak up?', displayOrder: 5 },
];

export const handlers = [
  /**
   * GET /api/me
   *
   * Mirrors the real route: the member profile, the persisted Slack link, and
   * the session context the navigation shell needs — `team` and `roles`.
   * `team` is null only when the team record cannot be resolved, which the
   * Prisma foreign key makes unreachable in production.
   *
   * Tests that care about a different role set or an unauthenticated response
   * override this with server.use(...).
   *
   * Requirements: Manager Experience 1.1, 1.3
   */
  http.get('/api/me', () => {
    return HttpResponse.json({
      id: 'member-1',
      teamId: 'team-1',
      name: 'Alice',
      email: 'alice@example.com',
      cadencePreference: 'session',
      remindersEnabled: true,
      currentStreak: 0,
      bestStreak: 0,
      slackLink: null,
      team: { id: 'team-1', name: 'Platform Squad', privacyMode: 'anonymous' },
      roles: ['delivery_manager'],
    });
  }),

  /**
   * GET /api/teams/[teamId]/sessions
   *
   * Mirrors the real route, which returns a **bare array** of sessions with
   * every date serialised as an ISO string — not an envelope, and not Date
   * objects. A mock that handed back Dates would let a component skip parsing
   * and still pass while the real page threw on the first date comparison.
   *
   * Empty by default: a team with no sessions is the state the dashboard's
   * lifecycle panel has to handle first. Tests needing sessions override this.
   *
   * Requirements: Manager Experience 2.1, 2.4
   */
  http.get('/api/teams/:teamId/sessions', () => HttpResponse.json([])),

  /**
   * GET /api/auth/session-link/[token]
   *
   * Returns enriched session context with cookie-based auth.
   * Field name is `responses` (NOT `existingResponses`) per Requirement 12.4.
   * Sets a session cookie via Set-Cookie header.
   */
  http.get('/api/auth/session-link/:token', ({ params }) => {
    const { token } = params;

    // Simulate invalid/expired token
    if (token === 'invalid-token' || token === 'expired-token') {
      return HttpResponse.json(
        { error: 'Invalid or expired session link' },
        { status: 404 },
      );
    }

    return HttpResponse.json(
      {
        memberId: 'member-1',
        sessionId: 'session-1',
        memberName: 'Alice',
        cadencePreference: 'weekly',
        sessionStatus: 'open' as const,
        questions: DEFAULT_QUESTIONS,
        allQuestions: DEFAULT_QUESTIONS,
        expandable: false,
        responses: [], // NOT `existingResponses`
      },
      {
        headers: {
          'Set-Cookie': 'session=mock-session-token; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly',
        },
      },
    );
  }),

  /**
   * GET /api/teams/[teamId]/trends
   *
   * Returns trend data matching the frontend TrendsResponse contract:
   * - sessions[]: { sessionId, closedAt (ISO string), averages[] }
   * - trendDistribution[]: array of { questionId, improving, stable, declining }
   * - privacyMode: string
   * - requiresMoreData?: boolean
   *
   * Per Requirement 12.4: uses `closedAt` (not `closeDate`), `averages` (not `questions`),
   * and `trendDistribution` is an array (not an object).
   */
  http.get('/api/teams/:teamId/trends', () => {
    return HttpResponse.json({
      sessions: [
        {
          sessionId: 'session-1',
          closedAt: '2025-01-08T17:00:00Z',
          averages: [
            { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
            { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 4 },
          ],
        },
        {
          sessionId: 'session-2',
          closedAt: '2025-01-15T17:00:00Z',
          averages: [
            { questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 6 },
            { questionId: 'q-team-collaboration', averageScore: 3.8, responseCount: 5 },
          ],
        },
      ],
      trendDistribution: [
        { questionId: 'q-delivering-value', improving: 3, stable: 2, declining: 1 },
        { questionId: 'q-team-collaboration', improving: 2, stable: 3, declining: 0 },
      ],
      privacyMode: 'anonymous',
    });
  }),

  /**
   * POST /api/responses
   *
   * Mirrors the real route: identity comes from the session cookie via the
   * withAuth wrapper, and the body carries only { sessionId, responses }.
   * The route reads `auth.memberId` and ignores any identity in the body, so a
   * mock that required one would let a UI regression pass unnoticed.
   *
   * Returns: { responses: [{ questionId, score, trendIndicator, rollingAverage }] }
   * Requirements: 5.1, 5.2, 5.3, 12.1, 12.4
   */
  http.post('/api/responses', async ({ request }) => {
    const body = await request.json() as {
      memberId?: string;
      sessionId?: string;
      responses?: Array<{ questionId: string; score: number; trendIndicator?: string }>;
    };

    // A caller-supplied identity is a contract violation, not an alternative
    if (body.memberId !== undefined) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'memberId is not accepted in the body; identity comes from the session cookie',
          },
        },
        { status: 400 },
      );
    }

    if (!body.sessionId || !body.responses) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: sessionId, responses' } },
        { status: 400 },
      );
    }

    // Return success response with rolling averages
    const results = body.responses.map((item) => ({
      questionId: item.questionId,
      score: item.score,
      trendIndicator: item.trendIndicator ?? null,
      rollingAverage: 3.5, // Default mock rolling average
    }));

    return HttpResponse.json({ responses: results });
  }),
];
