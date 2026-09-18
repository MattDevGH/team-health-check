/**
 * What a contributor sees where a Delivery Manager sees the lifecycle panel.
 *
 * Requirements: Reaching Your Health Check 1.1, 1.5; Manager Experience 2.1
 *
 * Found while writing the phase 4 browser test, which was meant to walk a
 * contributor through the two routes the milestone added. It could not: the
 * dashboard rendered the panel only for a manager, so a contributor with a
 * check collecting and a session link of their own was offered no way to answer
 * it. Requirement 1.1 says the dashboard shall offer that route and does not
 * make it a manager's privilege.
 *
 * The navigation route hid it. A contributor who clicks "Health check" gets
 * there, so the defect only shows for somebody who goes to the dashboard
 * first — which is exactly what a contributor does after being told their
 * team's results are worth reading.
 *
 * One panel with its writes gated, rather than a second panel for contributors:
 * two components deriving "what is happening with this check" would disagree
 * eventually, and the one nobody uses daily would be the one that drifted.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { SessionLifecyclePanel } from './session-lifecycle-panel';

expect.extend(toHaveNoViolations);

const TEAM_ID = 'team-1';
const OPEN_SESSION_ID = 'session-collecting';

/** The sessions endpoint, with one check collecting. */
function mockCollecting() {
  server.use(
    http.get(`/api/teams/${TEAM_ID}/sessions`, () =>
      HttpResponse.json([
        {
          id: OPEN_SESSION_ID,
          teamId: TEAM_ID,
          status: 'open',
          scheduledOpenAt: null,
          scheduledCloseAt: '2026-09-25T17:00:00.000Z',
          actualOpenAt: '2026-09-21T09:00:00.000Z',
          actualCloseAt: null,
          createdAt: '2026-09-21T09:00:00.000Z',
        },
      ]),
    ),
    http.get(`/api/teams/${TEAM_ID}/sessions/${OPEN_SESSION_ID}/participation`, () =>
      HttpResponse.json({ totalCount: 8, respondedCount: 3, nonResponders: [] }),
    ),
  );
}

/** Nothing open, so the panel is in the state that offers opening one. */
function mockIdle() {
  server.use(http.get(`/api/teams/${TEAM_ID}/sessions`, () => HttpResponse.json([])));
}

function renderAs(canManage: boolean) {
  return render(
    <SessionLifecyclePanel teamId={TEAM_ID} materialisedSessionIds={[]} canManage={canManage} />,
  );
}

async function settled() {
  await waitFor(() => {
    expect(screen.queryByText(/checking…/i)).not.toBeInTheDocument();
  });
}

describe('a contributor, while a check is collecting', () => {
  it('is offered a route to answer it', async () => {
    // Requirement 1.1. The defect: this was a manager's link only
    mockCollecting();
    renderAs(false);
    await settled();

    expect(screen.getByRole('link', { name: /your health check/i })).toHaveAttribute(
      'href',
      '/me/health-check',
    );
  });

  it('is told what is happening', async () => {
    mockCollecting();
    renderAs(false);
    await settled();

    expect(screen.getByText(/collecting responses/i)).toBeInTheDocument();
  });

  it('sees how many people have answered', async () => {
    /*
     * Kept, deliberately. The count is aggregate and carries no names, which
     * is the same reasoning that gives a contributor the dashboard at all —
     * a team should be able to read its own results.
     */
    mockCollecting();
    renderAs(false);
    await settled();

    expect(await screen.findByText(/3 of 8 answered/i)).toBeInTheDocument();
  });

  it('is offered no way to close it', async () => {
    // Navigation is not authorisation, but offering a control that would be
    // refused is the nav-Settings mistake in a different place
    mockCollecting();
    renderAs(false);
    await settled();

    expect(screen.queryByRole('button', { name: /close the health check/i })).toBeNull();
  });
});

describe('a contributor, while nothing is open', () => {
  it('is told so', async () => {
    mockIdle();
    renderAs(false);
    await settled();

    expect(screen.getByText(/no health check has run/i)).toBeInTheDocument();
  });

  it('is offered no way to open one', async () => {
    mockIdle();
    renderAs(false);
    await settled();

    expect(screen.queryByRole('button', { name: /open a health check/i })).toBeNull();
  });

  it('is offered no route to answer, because there is nothing to answer', async () => {
    // A link to an empty page is worse than no link: it says there is
    // something to do
    mockIdle();
    renderAs(false);
    await settled();

    expect(screen.queryByRole('link', { name: /your health check/i })).toBeNull();
  });
});

describe('a Delivery Manager keeps everything they had', () => {
  it('is offered the route to answer and the route to close', async () => {
    mockCollecting();
    renderAs(true);
    await settled();

    expect(screen.getByRole('link', { name: /your health check/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close the health check/i })).toBeInTheDocument();
  });

  it('is still offered the way to open one', async () => {
    mockIdle();
    renderAs(true);
    await settled();

    expect(screen.getByRole('button', { name: /open a health check/i })).toBeInTheDocument();
  });
});

describe('accessibility of the contributor panel', () => {
  it('has no axe violations while collecting', async () => {
    // NFR 3.1. A state no manager ever sees is a state no page-level audit
    // has ever visited
    mockCollecting();
    const { container } = renderAs(false);
    await settled();

    expect(await axe(container)).toHaveNoViolations();
  });
});
