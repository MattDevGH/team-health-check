/**
 * Tests for the session lifecycle panel.
 * Requirements: Manager Experience 2.1, 2.2, 2.4, 2.7
 *
 * TDD: Red phase — these define the behaviour before the component exists.
 *
 * This is the milestone's reason for existing: until now a health check could
 * only be opened through the API or by waiting for the scheduler.
 *
 * The handlers below mirror the real routes exactly, including dates as ISO
 * strings. `GET /api/teams/[teamId]/sessions` returns a bare array and `POST`
 * returns the created session with 201. A mock that handed back `Date` objects
 * would let the component skip parsing and still pass, while the real page
 * threw on the first date comparison.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { SessionLifecyclePanel } from './session-lifecycle-panel';

const TEAM_ID = 'team-1';

interface WireSession {
  id: string;
  teamId: string;
  status: string;
  scheduledOpenAt: string | null;
  scheduledCloseAt: string | null;
  actualOpenAt: string;
  actualCloseAt: string | null;
  createdAt: string;
}

/** A session exactly as the route serialises it: every date an ISO string. */
function wireSession(overrides: Partial<WireSession> & { id: string }): WireSession {
  return {
    teamId: TEAM_ID,
    status: 'closed',
    scheduledOpenAt: null,
    scheduledCloseAt: null,
    actualOpenAt: '2026-08-01T09:00:00.000Z',
    actualCloseAt: '2026-08-05T17:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * Serves the sessions endpoint. Returns a counter of POSTs so a test can assert
 * a request actually crossed the network, and lets the list change after one —
 * the panel refetches rather than trusting its own optimism.
 */
function mockSessions(options: {
  initial: WireSession[];
  afterOpen?: WireSession[];
  openStatus?: number;
}): () => number {
  let posts = 0;
  let current = options.initial;

  server.use(
    http.get(`/api/teams/${TEAM_ID}/sessions`, () => HttpResponse.json(current)),
    http.post(`/api/teams/${TEAM_ID}/sessions`, () => {
      posts += 1;
      if (options.openStatus && options.openStatus >= 400) {
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'Could not open' } },
          { status: options.openStatus },
        );
      }
      current = options.afterOpen ?? current;
      return HttpResponse.json(current[0] ?? {}, { status: 201 });
    }),
  );

  return () => posts;
}

/** Serves the participation endpoint for one session. */
function mockParticipation(
  sessionId: string,
  data: { totalCount: number; respondedCount: number } | { status: number },
) {
  server.use(
    http.get(`/api/teams/${TEAM_ID}/sessions/${sessionId}/participation`, () => {
      if ('status' in data) {
        return HttpResponse.json({ error: { message: 'nope' } }, { status: data.status });
      }
      return HttpResponse.json({ ...data, nonResponders: [] });
    }),
  );
}

function renderPanel(materialisedSessionIds: string[] = []) {
  return render(
    <SessionLifecyclePanel teamId={TEAM_ID} materialisedSessionIds={materialisedSessionIds} />,
  );
}

describe('SessionLifecyclePanel', () => {
  it('offers to open a check when the team has never run one', async () => {
    mockSessions({ initial: [] });
    renderPanel();

    expect(await screen.findByRole('button', { name: /open a health check/i })).toBeEnabled();
    expect(screen.getByText(/no health check has run/i)).toBeInTheDocument();
  });

  it('opens a check and shows it collecting, without a reload', async () => {
    const user = userEvent.setup();
    const countPosts = mockSessions({
      initial: [],
      afterOpen: [
        wireSession({
          id: 'opened-1',
          status: 'open',
          actualCloseAt: null,
          scheduledCloseAt: '2026-08-28T17:00:00.000Z',
        }),
      ],
    });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: /open a health check/i }));

    // The observable outcome is the state the manager is now looking at
    expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
    expect(countPosts(), 'a session should have been opened on the server').toBe(1);
    expect(
      screen.queryByRole('button', { name: /open a health check/i }),
      'a check is already running, so opening another must not be offered',
    ).not.toBeInTheDocument();
  });

  it('shows a check already collecting when the page loads', async () => {
    mockSessions({
      initial: [wireSession({ id: 'open-1', status: 'open', actualCloseAt: null })],
    });
    renderPanel();

    expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open a health check/i })).not.toBeInTheDocument();
  });

  it('reports the last completed check once its results exist', async () => {
    // Two closed sessions force a date comparison, so a component that failed
    // to parse the ISO strings would throw rather than quietly pass
    mockSessions({
      initial: [
        wireSession({ id: 'older', actualCloseAt: '2026-08-01T17:00:00.000Z' }),
        wireSession({ id: 'newer', actualCloseAt: '2026-08-20T17:00:00.000Z' }),
      ],
    });
    renderPanel(['older', 'newer']);

    expect(await screen.findByText(/last health check closed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open a health check/i })).toBeInTheDocument();
  });

  it('says results are still being prepared when the last check has none yet', async () => {
    mockSessions({ initial: [wireSession({ id: 'closed-1' })] });
    renderPanel([]);

    expect(await screen.findByText(/results are still being prepared/i)).toBeInTheDocument();
  });

  // Requirement 2.4: a manager watching a check needs to know whether it is
  // worth chasing anyone, and when it closes.

  describe('while a check is collecting', () => {
    const openSession = wireSession({
      id: 'open-1',
      status: 'open',
      actualCloseAt: null,
      scheduledCloseAt: '2026-08-28T17:00:00.000Z',
    });

    it('reports how many of the team have answered', async () => {
      mockSessions({ initial: [openSession] });
      mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
      renderPanel();

      expect(await screen.findByText(/3 of 8 answered/i)).toBeInTheDocument();
    });

    it('reports when the check is due to close', async () => {
      mockSessions({ initial: [openSession] });
      mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
      renderPanel();

      expect(await screen.findByText(/closes on 28 august 2026/i)).toBeInTheDocument();
    });

    it('still reports the check as collecting when participation cannot be read', async () => {
      // A failed count is not a reason to hide the fact that a check is running
      mockSessions({ initial: [openSession] });
      mockParticipation('open-1', { status: 500 });
      renderPanel();

      expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
      expect(screen.queryByText(/answered/i)).not.toBeInTheDocument();
    });

    it('omits a close time rather than inventing one when none is scheduled', async () => {
      mockSessions({
        initial: [
          wireSession({ id: 'open-1', status: 'open', actualCloseAt: null, scheduledCloseAt: null }),
        ],
      });
      mockParticipation('open-1', { totalCount: 2, respondedCount: 0 });
      renderPanel();

      expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
      expect(screen.queryByText(/closes on/i)).not.toBeInTheDocument();
    });
  });

  it('is announced as a region a manager can find', async () => {
    mockSessions({ initial: [] });
    renderPanel();

    expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
  });
});
