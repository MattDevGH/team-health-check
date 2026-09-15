/**
 * Tests for the Trend Dashboard page.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.8
 *
 * TDD: Red phase — these tests define expected behaviour for the
 * trend dashboard page component before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import TrendDashboardPage from '@/app/teams/[teamId]/dashboard/page';
import { ShellContextProvider } from '@/components/app-shell/shell-context';

const TEAM_ID = 'team-1';

/** One closed check, with one theme answered and one not. */
const ONE_SESSION = {
  sessionId: 's1',
  closedAt: '2025-01-08T17:00:00Z',
  materialisedAt: '2025-01-08T17:01:00Z',
  averages: [{ questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 }],
};

interface SessionData {
  sessionId: string;
  closedAt: string;
  /** Sent by the real route; the panels distinguish four silences with it. */
  materialisedAt?: string | null;
  averages: Array<{
    questionId: string;
    averageScore: number;
    responseCount: number;
  }>;
}

interface TrendDistributionData {
  questionId: string;
  improving: number;
  stable: number;
  declining: number;
}

function mockTrendsApi(options: {
  sessions?: SessionData[];
  trendDistribution?: TrendDistributionData[];
  privacyMode?: string;
  /**
   * The fixed catalogue. The real route always sends it, and without it the
   * panels fall back to naming only the themes that have answers — which is
   * the absence they exist to make visible.
   */
  questions?: Array<{ id: string; title: string; description: string }>;
} = {}) {
  const {
    sessions = [],
    trendDistribution = [],
    privacyMode,
    questions,
  } = options;

  server.use(
    http.get('/api/teams/:teamId/trends', () => {
      return HttpResponse.json({
        sessions,
        trendDistribution,
        // Mirrors the real route, which includes privacyMode in the response
        ...(privacyMode ? { privacyMode } : {}),
        ...(questions ? { questions } : {}),
      });
    }),
  );
}

function mockTrendsApiError() {
  server.use(
    http.get('/api/teams/:teamId/trends', () => {
      return HttpResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }),
  );
}

/**
 * Renders the dashboard as the shell would: inside the context its layout
 * resolved on the server.
 *
 * The page used to fetch `/api/me` for the roles and these tests used to vary
 * the answer through MSW. It takes them from the shell now, so the roles are an
 * argument rather than a request — which is both the change under test and the
 * reason this helper is simpler than the one it replaces.
 */
function renderDashboard(roles: string[] = []) {
  return render(
    <ShellContextProvider context={{ team: { id: TEAM_ID, name: 'Platform Squad' }, roles }}>
      <TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />
    </ShellContextProvider>,
  );
}

describe('Trend Dashboard Page', () => {
  /**
   * Manager Experience 2.1, 2.6: the panel is where a check is opened and
   * closed, so it belongs in every data state — a team with nothing to show is
   * exactly the team that needs to open its first check — and nowhere at all
   * for a member who would be refused the action.
   */
  describe('session lifecycle panel', () => {
    it('offers the panel to a delivery manager with no data yet', async () => {
      mockTrendsApi({ sessions: [] });
      renderDashboard(['delivery_manager']);

      expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /open a health check/i })).toBeInTheDocument();
    });

    it('offers the panel alongside a populated dashboard', async () => {
      mockTrendsApi({
        sessions: [
          { sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] },
          { sessionId: 's2', closedAt: '2026-08-08T17:00:00Z', averages: [] },
        ],
      });
      renderDashboard(['delivery_manager']);

      expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
    });

    it('withholds it from a member who is not a delivery manager', async () => {
      mockTrendsApi({ sessions: [] });
      renderDashboard();

      // Anchor on content the page always renders, so the absence is asserted
      // against a rendered dashboard rather than an empty document
      await screen.findByText(/more data needed/i);

      expect(screen.queryByRole('region', { name: /health check/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /open a health check/i }),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Manager Experience 3.7. The dashboard read "1 responses" for any question a
   * single person had answered — visible to any team where someone is on leave.
   */
  it('agrees in number when a single person has responded', async () => {
    mockTrendsApi({
      sessions: [
        {
          sessionId: 's1',
          closedAt: '2026-08-01T17:00:00Z',
          averages: [{ questionId: 'q-delivering-value', averageScore: 4, responseCount: 1 }],
        },
        {
          sessionId: 's2',
          closedAt: '2026-08-08T17:00:00Z',
          averages: [{ questionId: 'q-delivering-value', averageScore: 4, responseCount: 1 }],
        },
      ],
    });
    renderDashboard();

    expect(await screen.findByText('1 response')).toBeInTheDocument();
    expect(screen.queryByText('1 responses')).not.toBeInTheDocument();
  });

  /**
   * Manager Experience 4.3, 4.4, 4.5, 4.6: say what happens next, and stop
   * saying it once it has happened.
   */
  describe('first-run guidance', () => {
    it('explains that trends begin once a check closes', async () => {
      mockTrendsApi({ sessions: [] });
      renderDashboard(['delivery_manager']);

      const guidance = await screen.findByRole('region', { name: /next steps/i });
      expect(guidance).toHaveTextContent(/trends appear once a health check has closed/i);
    });

    it('explains that a second check is what makes a trend', async () => {
      mockTrendsApi({
        sessions: [{ sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] }],
      });
      renderDashboard();

      const guidance = await screen.findByRole('region', { name: /next steps/i });
      expect(guidance).toHaveTextContent(/one check has closed/i);
    });

    it('says what anonymous mode hides, so a gap is not read as silence', async () => {
      mockTrendsApi({
        sessions: [
          { sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] },
          { sessionId: 's2', closedAt: '2026-08-08T17:00:00Z', averages: [] },
        ],
        privacyMode: 'anonymous',
      });
      renderDashboard();

      const guidance = await screen.findByRole('region', { name: /next steps/i });
      expect(guidance).toHaveTextContent(/hidden is not the same as unanswered/i);
    });

    it('stops offering guidance once there is nothing left to say', async () => {
      mockTrendsApi({
        sessions: [
          { sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] },
          { sessionId: 's2', closedAt: '2026-08-08T17:00:00Z', averages: [] },
        ],
        privacyMode: 'attributed',
      });
      renderDashboard();

      // Anchor on content the page always renders, so the absence is asserted
      // against a loaded dashboard. Both checks here closed unanswered, so the
      // figure names that state rather than a score it cannot plot.
      await screen.findByRole('figure', { name: /no health check has been answered yet/i });
      expect(screen.queryByRole('region', { name: /next steps/i })).not.toBeInTheDocument();
    });
  });

  describe('Requirement 8.3: Fewer than 2 closed sessions', () => {
    it('displays "More data needed" when no sessions exist', async () => {
      mockTrendsApi({ sessions: [] });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
      });
    });

    it('still says a trend needs a second session when only 1 exists', async () => {
      mockTrendsApi({ sessions: [ONE_SESSION] });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
      });
    });
  });

  /**
   * Explaining Itself 1.1, 1.5.
   *
   * A delivery manager closed their first check on production and found a
   * dashboard reporting "more data needed" and nothing else. The check had
   * results; the page was talking about the chart. One session is a trend of
   * nothing and a result of something, and the two were conflated.
   */
  describe('a team that has closed exactly one check', () => {
    const QUESTIONS = [
      { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…?' },
      { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe…?' },
    ];

    it('shows the scores it has, rather than only talking about the chart', async () => {
      mockTrendsApi({ sessions: [ONE_SESSION], questions: QUESTIONS });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /latest session/i });
      expect(within(panel).getByText('3.5')).toBeInTheDocument();
    });

    it('names a theme nobody answered instead of omitting it', async () => {
      mockTrendsApi({ sessions: [ONE_SESSION], questions: QUESTIONS });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /latest session/i });
      expect(within(panel).getByText(/no responses/i)).toBeInTheDocument();
    });

    it('says results are being prepared while the first close is uncomputed', async () => {
      /*
       * The minutes after a first close, which is exactly when a new team
       * looks. Without this the page reports "more data needed" for a check
       * whose results are on their way.
       */
      mockTrendsApi({
        sessions: [
          {
            sessionId: 's1',
            closedAt: new Date(Date.now() - 60_000).toISOString(),
            materialisedAt: null,
            averages: [],
          },
        ],
        questions: QUESTIONS,
      });
      renderDashboard();

      const panel = await screen.findByRole('region', { name: /latest session/i });
      expect(within(panel).getAllByText(/being prepared/i).length).toBeGreaterThan(0);
    });

    it('draws no chart, which is the one thing a second session is needed for', async () => {
      mockTrendsApi({ sessions: [ONE_SESSION], questions: QUESTIONS });
      renderDashboard();

      await screen.findByRole('region', { name: /latest session/i });
      expect(screen.queryByRole('img', { name: /trend/i })).not.toBeInTheDocument();
      expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
    });
  });

  describe('Requirement 8.1: Line chart with averages', () => {
    const twoSessions: SessionData[] = [
      {
        sessionId: 's1',
        closedAt: '2025-01-08T17:00:00Z',
        averages: [
          { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
          { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 4 },
        ],
      },
      {
        sessionId: 's2',
        closedAt: '2025-01-15T17:00:00Z',
        averages: [
          { questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 6 },
          { questionId: 'q-team-collaboration', averageScore: 3.8, responseCount: 5 },
        ],
      },
    ];

    beforeEach(() => {
      mockTrendsApi({
        sessions: twoSessions,
        trendDistribution: [
          { questionId: 'q-delivering-value', improving: 3, stable: 2, declining: 1 },
          { questionId: 'q-team-collaboration', improving: 1, stable: 3, declining: 1 },
        ],
      });
    });

    it('renders an SVG chart when 2+ sessions exist', async () => {
      renderDashboard();

      await waitFor(() => {
        // The chart is a figure with a caption, not an unlabelled image: the
        // drawing itself is hidden from assistive technology and its values are
        // carried by the accompanying table
        expect(
          screen.getByRole('figure', { name: /average score per question/i }),
        ).toBeInTheDocument();
      });
    });

    it('does not show "More data needed" message', async () => {
      renderDashboard();

      await waitFor(() => {
        // The chart is a figure with a caption, not an unlabelled image: the
        // drawing itself is hidden from assistive technology and its values are
        // carried by the accompanying table
        expect(
          screen.getByRole('figure', { name: /average score per question/i }),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText(/more data needed/i)).not.toBeInTheDocument();
    });
  });

  describe('Requirement 8.8: Response count alongside averages', () => {
    beforeEach(() => {
      mockTrendsApi({
        sessions: [
          {
            sessionId: 's1',
            closedAt: '2025-01-08T17:00:00Z',
            averages: [
              { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
            ],
          },
          {
            sessionId: 's2',
            closedAt: '2025-01-15T17:00:00Z',
            averages: [
              { questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 6 },
            ],
          },
        ],
        trendDistribution: [
          { questionId: 'q-delivering-value', improving: 3, stable: 2, declining: 1 },
        ],
      });
    });

    it('displays response counts for the most recent session', async () => {
      renderDashboard();

      // Scoped to the Latest Session panel: the chart's data table now reports
      // counts too, so an unscoped search matches both and proves neither
      const panel = await screen.findByRole('region', { name: /latest session/i });
      expect(within(panel).getByText(/6 responses/i)).toBeInTheDocument();
    });
  });

  describe('Requirement 8.4: Trend indicator distribution', () => {
    beforeEach(() => {
      mockTrendsApi({
        sessions: [
          {
            sessionId: 's1',
            closedAt: '2025-01-08T17:00:00Z',
            averages: [
              { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
            ],
          },
          {
            sessionId: 's2',
            closedAt: '2025-01-15T17:00:00Z',
            averages: [
              { questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 6 },
            ],
          },
        ],
        trendDistribution: [
          { questionId: 'q-delivering-value', improving: 3, stable: 2, declining: 1 },
        ],
      });
    });

    it('displays trend indicator distribution for the most recent session', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/improving: 3/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/stable: 2/i)).toBeInTheDocument();
      expect(screen.getByText(/declining: 1/i)).toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('displays loading state initially', () => {
      mockTrendsApi({ sessions: [] });
      renderDashboard();

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays error message when API fails', async () => {
      mockTrendsApiError();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });
  });
});

/**
 * Dashboard Refinement 5.6.
 *
 * The Trend Indicators counts were reported as unreadable: they look like a
 * calculated trend, when each is the number of people who chose that word
 * themselves.
 */
describe('Trend indicators explanation', () => {
  it('says the counts are what people chose, not a calculation', async () => {
    mockTrendsApi({
      sessions: [
        { sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] },
        { sessionId: 's2', closedAt: '2026-08-08T17:00:00Z', averages: [] },
      ],
      trendDistribution: [
        { questionId: 'q-delivering-value', improving: 1, stable: 0, declining: 0 },
      ],
    });
    renderDashboard();

    expect(await screen.findByText(/not a trend calculated from the scores/i)).toBeInTheDocument();
  });
});

/**
 * Feeling Responsive 1.2, 1.3.
 *
 * The page took its roles from a request of its own — five database queries to
 * answer a question the layout had already answered, on a request the browser
 * could not start until the JavaScript had arrived.
 */
describe('where the dashboard gets its roles', () => {
  it('makes no identity request of its own', async () => {
    /*
     * Counted at the network boundary rather than by trusting the absence of a
     * fetch call: a handler that is never hit is the only proof that nothing
     * asked.
     */
    let identityRequests = 0;
    server.use(
      http.get('/api/me', () => {
        identityRequests += 1;
        return HttpResponse.json({ id: 'member-1', team: null, roles: [] });
      }),
    );
    mockTrendsApi({ sessions: [] });

    renderDashboard(['delivery_manager']);
    await screen.findByRole('region', { name: /health check/i });

    expect(identityRequests, 'the layout already resolved this').toBe(0);
  });

  it('offers the manager controls from the context it was given', async () => {
    mockTrendsApi({ sessions: [] });

    renderDashboard(['delivery_manager']);

    expect(await screen.findByRole('button', { name: /open a health check/i })).toBeInTheDocument();
  });

  it('offers no manager controls to a contributor in the same context', async () => {
    // The role is absent rather than the context, which is the case a member
    // is actually in
    mockTrendsApi({ sessions: [] });

    renderDashboard([]);
    await screen.findByText(/more data needed/i);

    expect(screen.queryByRole('button', { name: /open a health check/i })).not.toBeInTheDocument();
  });

  it('still renders outside a shell, offering nothing behind a role', async () => {
    /*
     * Requirement 1.3. The duplicate fetch was defended on the grounds that a
     * page should stand on its own, and the defence was sound — a page that
     * only renders inside one layout is a page nobody can test. Rendered with
     * no context it behaves as it did when its own request failed.
     */
    mockTrendsApi({ sessions: [] });

    render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

    expect(await screen.findByText(/more data needed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open a health check/i })).not.toBeInTheDocument();
  });
});
