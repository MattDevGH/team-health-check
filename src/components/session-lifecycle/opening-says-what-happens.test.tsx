/**
 * The control that opens a check says what opening one does.
 *
 * Requirements: Explaining Itself 6.2, 6.4; Manager Experience 4.x (first-run)
 *
 * From the production pass on 2026-09-19: "a one-liner explanation would be
 * good alongside 'open a health check' just for absolute clarity about what it
 * does and what happens next, for new Delivery Managers using the app."
 *
 * It is the one control in the application whose consequences reach other
 * people. Opening a check prompts a team — in Slack, by email, or both,
 * depending on how each member is set up — and until now the button said only
 * its own name. A manager pressing it for the first time had no way to know
 * whether it would message anybody, or when it would end.
 *
 * On the control rather than in a help section, and reachable through
 * `aria-describedby` rather than by proximity: an explanation a screen reader
 * does not meet with the button is an explanation for sighted readers only.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { SessionLifecyclePanel } from './session-lifecycle-panel';

const TEAM_ID = 'team-1';

/** Nothing running, which is when opening is offered. */
function mockIdle() {
  server.use(http.get(`/api/teams/${TEAM_ID}/sessions`, () => HttpResponse.json([])));
}

/** One check collecting, which is when opening is not offered. */
function mockCollecting() {
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
}

function renderPanel(canManage = true) {
  return render(
    <SessionLifecyclePanel teamId={TEAM_ID} materialisedSessionIds={[]} canManage={canManage} />,
  );
}

/** What a screen reader hears for the control, via `aria-describedby`. */
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

async function openControl(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /open a health check/i });
}

describe('before a manager opens their first check', () => {
  it('says that opening one prompts the team', async () => {
    // The consequence that reaches other people, and the one a first-time
    // manager cannot guess from a button that says only its own name
    mockIdle();
    renderPanel();

    expect(descriptionOf(await openControl())).toMatch(/prompt|tell|notif/i);
  });

  it('says how it ends', async () => {
    /*
     * Requirement 6.2 asks for "who is prompted, and when it closes". Without
     * the second half, opening reads as something that has to be undone by
     * hand, which is exactly the hesitation this line exists to remove.
     */
    mockIdle();
    renderPanel();

    expect(descriptionOf(await openControl())).toMatch(/close|schedule/i);
  });

  it('describes itself through the control, not merely beside it', async () => {
    // Requirement 6.4
    mockIdle();
    renderPanel();

    expect(await openControl()).toHaveAttribute('aria-describedby');
  });
});

describe('the explanation is scoped to the moment it helps', () => {
  it('is absent while a check is already collecting', async () => {
    /*
     * There is no open control in that state, so an explanation of opening
     * would be describing something that is not on screen. Guidance that
     * outlives its condition is the defect Manager Experience 4.6 names.
     */
    mockCollecting();
    renderPanel();

    await screen.findByText(/collecting responses/i);
    expect(screen.queryByText(/opening a check prompts/i)).toBeNull();
  });

  it('is absent for a contributor, who is offered no way to open one', async () => {
    mockIdle();
    renderPanel(false);

    await screen.findByText(/no health check has run/i);
    expect(screen.queryByText(/opening a check prompts/i)).toBeNull();
  });
});
