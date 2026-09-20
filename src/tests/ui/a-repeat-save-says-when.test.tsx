/**
 * Saving twice in a row has to look like two saves.
 *
 * Requirements: Explaining Itself 2.7
 *
 * Criterion 2.7 says the confirmation must differ visibly from the one already
 * on screen. The first attempt at it distinguished a first save from an update,
 * which covered save → update and left update → update saying exactly what it
 * had said a moment earlier.
 *
 * Found in the same place as the original: the deployed application, on
 * 2026-09-19. "Updating an answer a second time is still slightly ambiguous
 * that any action has taken place."
 *
 * A timestamp rather than a disappearing message. A message on a timer is gone
 * before a slow reader or a screen-reader user reaches it, and "it vanished" is
 * a worse answer to "did that work?" than no message at all. A time changes on
 * every press, which satisfies 2.7 for the second save and the sixth.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  ],
  allQuestions: [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How we deliver', displayOrder: 1 },
  ],
  expandable: false,
  responses: [],
};

/**
 * The time a member in this timezone would see on their own clock.
 *
 * Not a hard-coded "14:32": the page formats for the reader, so an instant
 * fixed in UTC renders as 15:32 in British Summer Time and the test would pass
 * only in winter. Deriving it keeps the assertion about *which* instant is
 * shown, which is the part that matters, while the shape and the absence of an
 * ISO timestamp are asserted separately below.
 */
function asClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderPage() {
  return render(<SessionLinkPage params={Promise.resolve({ token: 'tok-1' })} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-20T14:32:00.000Z'));

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

afterEach(() => {
  vi.useRealTimers();
});

/** Scores the one question and submits. */
async function answerAndSubmit(user: ReturnType<typeof userEvent.setup>, score: string) {
  const group = await screen.findByRole('group', { name: /delivering value/i });
  await user.click(within(group).getByRole('radio', { name: score }));
  await user.click(screen.getByRole('button', { name: /^submit|^update/i }));
  await screen.findByRole('status');
}

/** Changes the score and presses the control again. */
async function changeAndSave(user: ReturnType<typeof userEvent.setup>, score: string) {
  const group = screen.getByRole('group', { name: /delivering value/i });
  await user.click(within(group).getByRole('radio', { name: score }));
  await user.click(screen.getByRole('button', { name: /^update/i }));
}

describe('the confirmation carries the time it was saved', () => {
  it('says when, not only what', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await answerAndSubmit(user, '4');

    expect(screen.getByRole('status')).toHaveTextContent(asClock('2026-09-20T14:32:00.000Z'));
  });

  it('changes when a second update lands', async () => {
    /*
     * The defect. Both presses are updates, so both say "your answers are
     * updated" — and without a time, the second one renders a screen identical
     * to the one already there.
     */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await answerAndSubmit(user, '4');
    await changeAndSave(user, '2');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/updated/i));
    const afterFirstUpdate = screen.getByRole('status').textContent;

    vi.setSystemTime(new Date('2026-09-20T14:35:00.000Z'));
    await changeAndSave(user, '5');

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).not.toBe(afterFirstUpdate);
    });
    expect(screen.getByRole('status')).toHaveTextContent(asClock('2026-09-20T14:35:00.000Z'));
  });

  it('changes even when the answers do not', async () => {
    /*
     * Pressing the button having changed nothing is the case that started all
     * of this — a member checking whether their answers are really in there.
     * The wording stays "no changes", which is the honest answer, and the time
     * still moves, which is what says the press was received.
     */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await answerAndSubmit(user, '4');
    const afterFirstSave = screen.getByRole('status').textContent;

    vi.setSystemTime(new Date('2026-09-20T14:40:00.000Z'));
    await user.click(screen.getByRole('button', { name: /^update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
    expect(screen.getByRole('status').textContent).not.toBe(afterFirstSave);
    expect(screen.getByRole('status')).toHaveTextContent(asClock('2026-09-20T14:40:00.000Z'));
  });

  it('shows a time a reader recognises, not a machine one', async () => {
    // The locale is pinned everywhere else dates are shown here, for the same
    // reason: a value that reads one way on a British machine and another on
    // CI is a value nobody can assert on
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await answerAndSubmit(user, '4');

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/\b\d{2}:\d{2}\b/);
    expect(text, 'no ISO timestamps in front of a person').not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  });
});
