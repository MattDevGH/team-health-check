/**
 * A save that worked must look different from one that did nothing.
 *
 * Requirements: Explaining Itself 2.1, 2.6, 2.7
 *
 * From the production pass on 2026-09-18, the first time anybody answered a
 * check on the deployed application through the interface rather than from a
 * link in a message.
 *
 * Two findings, one root. He submitted from the bottom of a five-question form
 * and thought nothing had happened — the confirmation was at the top, off
 * screen. Then he changed an answer and saved again, and nothing on the page
 * moved: the control still read "Update responses", and the confirmation from
 * the first save was still there saying the same words.
 *
 * Criterion 2.1 was met both times. The page did confirm. A confirmation
 * nobody sees and a confirmation that cannot be told from the last one are two
 * ways of failing a requirement that reads as satisfied.
 *
 * Worth saying plainly: `page.test.tsx` already had "reports a real change as
 * saved rather than as nothing", and it passed against this defect. It asserted
 * the message did *not* say "no changes" — which was true of a box that had not
 * changed at all since the previous save. Asserting an absence let the stale
 * message through.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../mocks/server';
import SessionLinkPage from '@/app/session/[token]/page';

const MOCK_CONTEXT = {
  memberId: 'member-1',
  sessionId: 'session-1',
  memberName: 'Alice',
  cadencePreference: 'weekly',
  sessionStatus: 'open' as const,
  questions: [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How we deliver', displayOrder: 1 },
    { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How we work', displayOrder: 2 },
  ],
  allQuestions: [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How we deliver', displayOrder: 1 },
    { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How we work', displayOrder: 2 },
  ],
  expandable: false,
  responses: [],
};

function renderPage() {
  return render(<SessionLinkPage params={Promise.resolve({ token: 'tok-1' })} />);
}

beforeEach(() => {
  server.use(
    http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
    http.post('/api/responses', () =>
      HttpResponse.json({
        responses: [{ questionId: 'q-delivering-value', score: 4, rollingAverage: 4 }],
      }),
    ),
    http.get('/api/me', () => HttpResponse.json({ id: 'member-1', name: 'Alice' })),
  );
});

/** Answers both questions with the same score. */
async function answerEverything(user: ReturnType<typeof userEvent.setup>, score: string) {
  await screen.findByRole('group', { name: /delivering value/i });
  for (const name of [/delivering value/i, /team collaboration/i]) {
    const group = screen.getByRole('group', { name });
    await user.click(within(group).getByRole('radio', { name: score }));
  }
}

/** Answers, submits, and waits for the control to become an update control. */
async function answerAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await answerEverything(user, '4');
  await user.click(screen.getByRole('button', { name: /^submit/i }));
  await screen.findByRole('button', { name: /update/i });
}

describe('where the confirmation appears', () => {
  it('sits with the control that was pressed, not above the form', async () => {
    /*
     * Requirement 2.6. The confirmation only ever appears in response to a
     * click on the submit control, which is at the foot of the form — so the
     * reader is always at the bottom when it renders, and the top of the page
     * is always the wrong place for it.
     *
     * Asserted on document order rather than on a class name: what matters is
     * that a reader who has just pressed the button does not have to go
     * looking.
     */
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    const confirmation = screen.getByRole('status');
    const control = screen.getByRole('button', { name: /update/i });

    const position = control.compareDocumentPosition(confirmation);
    expect(
      position & Node.DOCUMENT_POSITION_FOLLOWING,
      'the confirmation should come after the control that produced it',
    ).toBeTruthy();
  });

  it('leaves the form in place rather than replacing it', async () => {
    // Requirement 2.5, unchanged and worth holding: submitting used to swap
    // the page for a receipt, which said nothing about answers still being
    // yours to change
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    expect(screen.getByRole('group', { name: /delivering value/i })).toBeInTheDocument();
  });
});

describe('saving again after changing an answer', () => {
  it('says something different from what is already on screen', async () => {
    /*
     * Requirement 2.7, and the defect itself. The previous test for this
     * asserted the message did not say "no changes" — true of a box that had
     * not changed at all, which is exactly what a member sees as nothing
     * happening.
     */
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    const afterFirstSave = screen.getByRole('status').textContent;

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).not.toBe(afterFirstSave);
    });
  });

  it('names it as an update rather than as a first save', async () => {
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/updated/i);
    });
  });

  it('still says nothing changed when nothing did', async () => {
    // The third state, and the one already built. Three outcomes rather than
    // two: first save, update, and no change
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
  });

  it('goes back to saying nothing changed after an update', async () => {
    /*
     * The sequence a member actually performs: save, change, save, press again
     * to be sure. Each step has to say what it did, and "updated" persisting
     * into a press that changed nothing would be the same defect wearing new
     * words.
     */
    const user = userEvent.setup();
    renderPage();
    await answerAndSubmit(user);

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/updated/i));

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
  });
});

describe('a member who answered on an earlier visit', () => {
  it('is told their answers were updated, not saved for the first time', async () => {
    /*
     * They arrive with answers already stored, change one, and save. Calling
     * that a first save would be wrong about what happened — and it is the
     * commonest revision path, since a member who wants to change an answer
     * comes back to the page to do it.
     */
    server.use(
      http.get('/api/auth/session-link/:token', () =>
        HttpResponse.json({
          ...MOCK_CONTEXT,
          responses: [
            { questionId: 'q-delivering-value', score: 4, trendIndicator: null },
            { questionId: 'q-team-collaboration', score: 4, trendIndicator: null },
          ],
        }),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('group', { name: /delivering value/i });

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/updated/i);
    });
  });

  it('is told nothing changed when they save without touching anything', async () => {
    // The same arrival, pressing the button to find out whether their answers
    // are really in there. They are, and saying so is the honest answer
    server.use(
      http.get('/api/auth/session-link/:token', () =>
        HttpResponse.json({
          ...MOCK_CONTEXT,
          responses: [
            { questionId: 'q-delivering-value', score: 4, trendIndicator: null },
            { questionId: 'q-team-collaboration', score: 4, trendIndicator: null },
          ],
        }),
      ),
    );

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('group', { name: /delivering value/i });

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
  });
});
