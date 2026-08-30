/**
 * Tests for the Trend Dashboard page.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.8
 *
 * TDD: Red phase — these tests define expected behaviour for the
 * trend dashboard page component before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import TrendDashboardPage from '@/app/teams/[teamId]/dashboard/page';

const TEAM_ID = 'team-1';

interface SessionData {
  sessionId: string;
  closedAt: string;
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
} = {}) {
  const {
    sessions = [],
    trendDistribution = [],
  } = options;

  server.use(
    http.get('/api/teams/:teamId/trends', () => {
      return HttpResponse.json({
        sessions,
        trendDistribution,
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

/** Overrides /api/me so the page sees a member with the given roles. */
function mockRoles(roles: string[]) {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'member-1',
        teamId: TEAM_ID,
        name: 'Alice',
        slackLink: null,
        team: { id: TEAM_ID, name: 'Platform Squad' },
        roles,
      }),
    ),
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
      mockRoles(['delivery_manager']);
      mockTrendsApi({ sessions: [] });
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /open a health check/i })).toBeInTheDocument();
    });

    it('offers the panel alongside a populated dashboard', async () => {
      mockRoles(['delivery_manager']);
      mockTrendsApi({
        sessions: [
          { sessionId: 's1', closedAt: '2026-08-01T17:00:00Z', averages: [] },
          { sessionId: 's2', closedAt: '2026-08-08T17:00:00Z', averages: [] },
        ],
      });
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
    });

    it('withholds it from a member who is not a delivery manager', async () => {
      mockRoles([]);
      mockTrendsApi({ sessions: [] });
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      // Anchor on content the page always renders, so the absence is asserted
      // against a rendered dashboard rather than an empty document
      await screen.findByText(/more data needed/i);

      expect(screen.queryByRole('region', { name: /health check/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /open a health check/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Requirement 8.3: Fewer than 2 closed sessions', () => {
    it('displays "More data needed" when no sessions exist', async () => {
      mockTrendsApi({ sessions: [] });
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
      });
    });

    it('displays "More data needed" when only 1 session exists', async () => {
      mockTrendsApi({
        sessions: [
          {
            sessionId: 's1',
            closedAt: '2025-01-08T17:00:00Z',
            averages: [
              { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
            ],
          },
        ],
      });
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
      });
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
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByRole('img', { name: /trend chart/i })).toBeInTheDocument();
      });
    });

    it('does not show "More data needed" message', async () => {
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByRole('img', { name: /trend chart/i })).toBeInTheDocument();
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
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByText(/6 responses/i)).toBeInTheDocument();
      });
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
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

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
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays error message when API fails', async () => {
      mockTrendsApiError();
      render(<TrendDashboardPage params={Promise.resolve({ teamId: TEAM_ID })} />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });
  });
});
