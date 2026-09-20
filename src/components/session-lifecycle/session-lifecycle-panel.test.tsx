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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { SessionLifecyclePanel } from './session-lifecycle-panel';

expect.extend(toHaveNoViolations);

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
/**
 * A stand-in for the server's session list.
 *
 * Mutable so a test can say what the list becomes after an open or a close —
 * the panel refetches, so what it renders next depends on what the server would
 * then report, not on what the panel guessed.
 */
interface SessionsMock {
  /** POSTs the panel has issued. */
  posts(): number;
  /** Replaces what the sessions endpoint will return from now on. */
  setSessions(sessions: WireSession[]): void;
}

function mockSessions(options: {
  initial: WireSession[];
  afterOpen?: WireSession[];
  openStatus?: number;
}): SessionsMock {
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

  return {
    posts: () => posts,
    setSessions: sessions => {
      current = sessions;
    },
  };
}

/**
 * Serves the close endpoint, returning a counter of PATCHes issued.
 *
 * `revealing` is what the sessions endpoint reports afterwards, so the panel's
 * refetch sees the state a real server would then be in.
 */
function mockClose(
  sessionId: string,
  options: { status?: number; sessions?: SessionsMock; revealing?: WireSession[] } = {},
): () => number {
  let patches = 0;

  server.use(
    http.patch(`/api/teams/${TEAM_ID}/sessions/${sessionId}`, () => {
      patches += 1;
      if (options.status && options.status >= 400) {
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'Session is already closed' } },
          { status: options.status },
        );
      }
      if (options.sessions && options.revealing) {
        options.sessions.setSessions(options.revealing);
      }
      return HttpResponse.json({ closed: true });
    }),
  );

  return () => patches;
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

/**
 * Renders the panel as a Delivery Manager.
 *
 * `canManage` is passed explicitly rather than defaulted in the component: a
 * default of true would hand a contributor controls the route refuses. What a
 * contributor sees instead has its own file, `contributor-view.test.tsx`.
 */
function renderPanel(materialisedSessionIds: string[] = []) {
  return render(
    <SessionLifecyclePanel
      teamId={TEAM_ID}
      materialisedSessionIds={materialisedSessionIds}
      canManage
    />,
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
    const sessions = mockSessions({
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
    expect(sessions.posts(), 'a session should have been opened on the server').toBe(1);
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

  /**
   * Requirement 2.3: closing is irreversible and ends collection, so it is
   * confirmed. Opening is not — the service closes any existing open session
   * when a new one opens, so it is recoverable.
   */
  describe('closing a check', () => {
    const openSession = wireSession({
      id: 'open-1',
      status: 'open',
      actualCloseAt: null,
      scheduledCloseAt: '2026-08-28T17:00:00.000Z',
    });

    const closedSession = wireSession({
      id: 'open-1',
      status: 'closed',
      actualCloseAt: '2026-08-27T12:00:00.000Z',
    });

    function mockCollecting(): SessionsMock {
      mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
      return mockSessions({ initial: [openSession] });
    }

    it('offers a close control while a check is collecting', async () => {
      mockCollecting();
      renderPanel();

      expect(await screen.findByRole('button', { name: /^close the health check$/i })).toBeEnabled();
    });

    it('asks for confirmation and sends nothing until it is given', async () => {
      const user = userEvent.setup();
      mockCollecting();
      const countPatches = mockClose('open-1');
      renderPanel();

      await user.click(await screen.findByRole('button', { name: /^close the health check$/i }));

      expect(await screen.findByRole('dialog', { name: /close this health check/i })).toBeInTheDocument();
      expect(
        countPatches(),
        'asking the question must not also answer it',
      ).toBe(0);
    });

    it('closes the check once confirmed and reports results as pending', async () => {
      const user = userEvent.setup();
      const sessions = mockCollecting();
      const countPatches = mockClose('open-1', { sessions, revealing: [closedSession] });
      renderPanel();

      await user.click(await screen.findByRole('button', { name: /^close the health check$/i }));
      await user.click(
        await screen.findByRole('button', { name: /^yes, close it$/i }),
      );

      expect(await screen.findByText(/results are still being prepared/i)).toBeInTheDocument();
      expect(countPatches()).toBe(1);
    });

    it('sends nothing when the confirmation is dismissed, and gives focus back', async () => {
      const user = userEvent.setup();
      mockCollecting();
      const countPatches = mockClose('open-1');
      renderPanel();

      const trigger = await screen.findByRole('button', { name: /^close the health check$/i });
      await user.click(trigger);
      await user.click(await screen.findByRole('button', { name: /^cancel$/i }));

      expect(countPatches(), 'a dismissed confirmation must not close anything').toBe(0);
      expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
      // Focus has to come back, or a keyboard user is dropped at the top of the
      // document with no idea where they were
      expect(trigger).toHaveFocus();
    });

    it('closes the confirmation on Escape without closing the check', async () => {
      const user = userEvent.setup();
      mockCollecting();
      const countPatches = mockClose('open-1');
      renderPanel();

      const trigger = await screen.findByRole('button', { name: /^close the health check$/i });
      await user.click(trigger);
      await screen.findByRole('dialog', { name: /close this health check/i });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(countPatches()).toBe(0);
      expect(trigger).toHaveFocus();
    });
  });

  /**
   * Requirement 2.5: a failed action reports what the server said and leaves
   * the displayed state alone. Showing a check as closed because the request to
   * close it failed would be worse than showing nothing.
   */
  describe('when an action fails', () => {
    it('reports the server\'s message and leaves the state as it was', async () => {
      const user = userEvent.setup();
      mockSessions({ initial: [], openStatus: 409 });
      renderPanel();

      await user.click(await screen.findByRole('button', { name: /open a health check/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not open/i);
      expect(
        screen.getByText(/no health check has run/i),
        'the panel must not claim a check is running when opening failed',
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open a health check/i })).toBeEnabled();
    });

    it('keeps a check collecting when closing it fails', async () => {
      const user = userEvent.setup();
      mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
      mockSessions({
        initial: [wireSession({ id: 'open-1', status: 'open', actualCloseAt: null })],
      });
      mockClose('open-1', { status: 409 });
      renderPanel();

      await user.click(await screen.findByRole('button', { name: /^close the health check$/i }));
      await user.click(await screen.findByRole('button', { name: /^yes, close it$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/already closed/i);
      expect(screen.getByText(/collecting responses/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^close the health check$/i }),
        'the manager needs the control back to try again',
      ).toBeInTheDocument();
    });

    it('clears the failure once an action succeeds', async () => {
      const user = userEvent.setup();
      mockSessions({ initial: [], openStatus: 409 });
      renderPanel();

      await user.click(await screen.findByRole('button', { name: /open a health check/i }));
      await screen.findByRole('alert');

      // The endpoint recovers
      mockSessions({
        initial: [wireSession({ id: 'open-1', status: 'open', actualCloseAt: null })],
      });
      mockParticipation('open-1', { totalCount: 4, respondedCount: 0 });
      await user.click(screen.getByRole('button', { name: /open a health check/i }));

      expect(await screen.findByText(/collecting responses/i)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('is announced as a region a manager can find', async () => {
    mockSessions({ initial: [] });
    renderPanel();

    expect(await screen.findByRole('region', { name: /health check/i })).toBeInTheDocument();
  });
});

/**
 * Closing a check that nobody has answered.
 * Requirements: Manager Experience 2.8
 *
 * A check nobody answered is real information — disengagement, bad timing, a
 * team underwater — so the tool records it rather than refusing to. What it
 * guards against is the *accident*: both of the empty checks in the live
 * database came from lifecycle testing, closed without anyone noticing there was
 * nothing in them. The confirmation already exists; it just has to say what is
 * about to be recorded.
 */
describe('SessionLifecyclePanel closing a check nobody answered', () => {
  const openSession = wireSession({
    id: 'open-1',
    status: 'open',
    actualOpenAt: '2026-09-01T09:00:00.000Z',
    actualCloseAt: null,
    scheduledCloseAt: '2026-09-08T17:00:00.000Z',
  });

  async function openConfirmation() {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: /^close the health check$/i }));
    return { user, dialog: await screen.findByRole('dialog', { name: /close this health check/i }) };
  }

  it('says what closing an unanswered check will record', async () => {
    mockParticipation('open-1', { totalCount: 8, respondedCount: 0 });
    mockSessions({ initial: [openSession] });

    const { dialog } = await openConfirmation();

    expect(dialog).toHaveTextContent(/nobody has answered/i);
  });

  it('does not warn when someone has answered', async () => {
    // A warning on every close is a warning nobody reads
    mockParticipation('open-1', { totalCount: 8, respondedCount: 1 });
    mockSessions({ initial: [openSession] });

    const { dialog } = await openConfirmation();

    expect(dialog).not.toHaveTextContent(/nobody has answered/i);
  });

  it('claims nothing when participation cannot be read', async () => {
    // Unknown is not zero. Asserting an empty check we cannot see would be a
    // guess dressed as a fact, and would train the reader to ignore it
    mockParticipation('open-1', { status: 500 });
    mockSessions({ initial: [openSession] });

    const { dialog } = await openConfirmation();

    expect(dialog).not.toHaveTextContent(/nobody has answered/i);
  });

  it('still closes when the warning is confirmed', async () => {
    // The warning informs the decision; it does not take it away
    mockParticipation('open-1', { totalCount: 8, respondedCount: 0 });
    mockSessions({ initial: [openSession] });
    const countPatches = mockClose('open-1');

    const { user } = await openConfirmation();
    await user.click(screen.getByRole('button', { name: /yes, close it/i }));

    await waitFor(() => expect(countPatches()).toBe(1));
  });
});

/**
 * A route to answer, beside the route to close.
 *
 * Requirements: Reaching Your Health Check 1.1, 1.4
 *
 * The panel already reported "0 of 1 answered" and offered a button to *close*
 * the check. It offered nothing to *answer* it, which is how production came to
 * open a check on 2026-09-14 that the delivery manager could watch and end but
 * not take part in.
 *
 * Adding a control can make an existing one ambiguous — this project learned
 * that during the dashboard refinement — so the close control is asserted to be
 * unchanged rather than assumed to be.
 */
describe('SessionLifecyclePanel offers a way to answer', () => {
  const openSession = wireSession({
    id: 'open-1',
    status: 'open',
    actualOpenAt: '2026-09-01T09:00:00.000Z',
    actualCloseAt: null,
    scheduledCloseAt: '2026-09-08T17:00:00.000Z',
  });

  it('links to the answering route while a check is collecting', async () => {
    mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
    mockSessions({ initial: [openSession] });
    renderPanel();

    const link = await screen.findByRole('link', { name: /go to your health check/i });
    expect(link).toHaveAttribute('href', '/me/health-check');
  });

  it('does not offer it when nothing is collecting', async () => {
    mockSessions({ initial: [] });
    renderPanel();

    await screen.findByRole('button', { name: /open a health check/i });
    expect(screen.queryByRole('link', { name: /answer/i })).not.toBeInTheDocument();
  });

  it('leaves the close control exactly where it was', async () => {
    // A second control next to a destructive one is the moment an interface
    // becomes ambiguous. The close button keeps its name and its behaviour.
    mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
    mockSessions({ initial: [openSession] });
    const countPatches = mockClose('open-1');
    renderPanel();

    const close = await screen.findByRole('button', { name: /^close the health check$/i });
    expect(close).toBeEnabled();
    expect(countPatches(), 'rendering must not close anything').toBe(0);
  });

  it('still offers it to somebody who has answered everything', async () => {
    /*
     * Requirement 1.4. Responses are editable until close, so "you have
     * answered" is not a reason to take the route away — and the panel has no
     * idea whether the *reader* is among those who answered, only how many
     * have.
     *
     * The behaviour is already right: the link renders while a check
     * collects, unconditionally. Nothing asserted it, which is how a later
     * "helpful" change hiding it at full participation would have passed.
     */
    mockParticipation('open-1', { totalCount: 8, respondedCount: 8 });
    mockSessions({ initial: [openSession] });
    renderPanel();

    const link = await screen.findByRole('link', { name: /go to your health check/i });
    expect(link).toHaveAttribute('href', '/me/health-check');
  });

  it('has no axe-detectable violations while collecting', async () => {
    // NFR 3.1. This file had no axe coverage at all — a gap the phase-1
    // reconciliation found rather than one it made
    mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
    mockSessions({ initial: [openSession] });
    const { container } = renderPanel();

    await screen.findByRole('link', { name: /go to your health check/i });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with nothing collecting either', async () => {
    // The other state a reader actually lands on, and the one with a different
    // set of controls
    mockSessions({ initial: [] });
    const { container } = renderPanel();

    await screen.findByRole('button', { name: /open a health check/i });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('reaches both controls by keyboard, in a sensible order', async () => {
    /*
     * Answer before close. Somebody tabbing through should meet the ordinary
     * action before the destructive one.
     */
    mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
    mockSessions({ initial: [openSession] });
    const user = userEvent.setup();
    renderPanel();

    const answer = await screen.findByRole('link', { name: /go to your health check/i });
    answer.focus();
    expect(answer).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: /^close the health check$/i })).toHaveFocus();
  });

  it('routes through the member’s own page rather than embedding a token', async () => {
    /*
     * The panel does not know which session link belongs to the reader, and
     * must not: a link is a credential. It points at the route that resolves
     * the reader's own from their cookie.
     */
    mockParticipation('open-1', { totalCount: 8, respondedCount: 3 });
    mockSessions({ initial: [openSession] });
    renderPanel();

    const link = await screen.findByRole('link', { name: /go to your health check/i });
    expect(link.getAttribute('href')).not.toMatch(/\/session\//);
  });
});
