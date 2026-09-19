/**
 * "Being prepared" has to say how long, wherever it is the only thing on screen.
 *
 * Requirements: Explaining Itself 1.1, 1.2, 1.5
 *
 * Criterion 1.2 asks that the message bound the wait — minutes, rather than
 * leaving a reader to guess whether to refresh — and the dashboard's Latest
 * Session panel has said "this usually takes a few minutes" since the milestone
 * was built.
 *
 * It does not render until a team has results. Found in the browser while
 * writing phase 5: after a team's **first** check closes there is no Latest
 * Session panel yet, so the only sentence on the page is this panel's "Results
 * are still being prepared." — unbounded, which is what 1.2 exists to forbid.
 *
 * That is the worst possible moment for it. A team's first check is when
 * nobody yet knows whether the tool works, and an open-ended message is
 * indistinguishable from one that will never change.
 *
 * So the horizon belongs in both places, not in whichever panel happens to be
 * on screen. Criterion 1.5 says the same thing about drill-downs: an
 * explanation that only exists somewhere the reader has not gone is not an
 * explanation.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { SessionLifecyclePanel } from './session-lifecycle-panel';

const TEAM_ID = 'team-1';
const CLOSED_SESSION_ID = 'session-closed';

/** One check, closed, with no aggregates computed for it yet. */
function mockAwaitingResults() {
  server.use(
    http.get(`/api/teams/${TEAM_ID}/sessions`, () =>
      HttpResponse.json([
        {
          id: CLOSED_SESSION_ID,
          teamId: TEAM_ID,
          status: 'closed',
          scheduledOpenAt: null,
          scheduledCloseAt: '2026-09-18T17:00:00.000Z',
          actualOpenAt: '2026-09-14T09:00:00.000Z',
          actualCloseAt: '2026-09-18T17:00:00.000Z',
          createdAt: '2026-09-14T09:00:00.000Z',
        },
      ]),
    ),
  );
}

function renderPanel() {
  return render(
    <SessionLifecyclePanel teamId={TEAM_ID} materialisedSessionIds={[]} canManage />,
  );
}

describe('a check that has closed with no results yet', () => {
  it('says results are being prepared', async () => {
    // Requirement 1.1, unchanged — saying nothing here reads as nobody having
    // answered
    mockAwaitingResults();
    renderPanel();

    expect(await screen.findByText(/results are still being prepared/i)).toBeInTheDocument();
  });

  it('says how long that usually takes', async () => {
    /*
     * Requirement 1.2. This is the only sentence a team sees after its first
     * check closes, because the Latest Session panel — which has carried the
     * horizon all along — does not render until there are results to show.
     */
    mockAwaitingResults();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/results are still being prepared/i)).toHaveTextContent(
        /few minutes/i,
      );
    });
  });

  it('bounds the wait without promising a time it cannot keep', async () => {
    /*
     * "A few minutes" rather than a number. The interval is whatever the
     * external trigger is set to — measured at five minutes today, changeable
     * by somebody editing a cron job — so a precise promise here would be a
     * number this code cannot honour.
     */
    mockAwaitingResults();
    renderPanel();

    const message = await screen.findByText(/results are still being prepared/i);
    expect(message.textContent).not.toMatch(/\b\d+ minutes?\b/);
  });
});

describe('the states that are not waiting for anything', () => {
  it('says nothing about minutes when a check is collecting', async () => {
    // A horizon on the wrong state is worse than none: it would tell a reader
    // to wait for something that is not coming
    server.use(
      http.get(`/api/teams/${TEAM_ID}/sessions`, () =>
        HttpResponse.json([
          {
            id: 'session-open',
            teamId: TEAM_ID,
            status: 'open',
            scheduledOpenAt: null,
            scheduledCloseAt: null,
            actualOpenAt: '2026-09-14T09:00:00.000Z',
            actualCloseAt: null,
            createdAt: '2026-09-14T09:00:00.000Z',
          },
        ]),
      ),
      http.get(`/api/teams/${TEAM_ID}/sessions/session-open/participation`, () =>
        HttpResponse.json({ totalCount: 3, respondedCount: 1, nonResponders: [] }),
      ),
    );
    renderPanel();

    const message = await screen.findByText(/collecting responses/i);
    expect(message).not.toHaveTextContent(/few minutes/i);
  });

  it('says nothing about minutes when no check has ever run', async () => {
    server.use(http.get(`/api/teams/${TEAM_ID}/sessions`, () => HttpResponse.json([])));
    renderPanel();

    const message = await screen.findByText(/no health check has run/i);
    expect(message).not.toHaveTextContent(/few minutes/i);
  });
});
