/**
 * Tests for Session Link Page — response submission and confirmation
 * Requirements: 4.6, 4.9, 16.1, 16.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import SessionLinkPage from './page';

const MOCK_CONTEXT = {
  memberId: 'member-1',
  sessionId: 'session-1',
  memberName: 'Alice',
  cadencePreference: 'weekly',
  sessionStatus: 'open' as const,
  questions: [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'Value desc', displayOrder: 1 },
    { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'Collab desc', displayOrder: 2 },
  ],
  allQuestions: [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'Value desc', displayOrder: 1 },
    { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'Collab desc', displayOrder: 2 },
  ],
  expandable: false,
  responses: [],
};

function renderPage(token = 'valid-token') {
  const params = Promise.resolve({ token });
  return render(<SessionLinkPage params={params} />);
}

describe('Session Link Page — Response Submission', () => {
  beforeEach(() => {
    // Mock the session-link validation endpoint
    server.use(
      http.get('/api/auth/session-link/:token', ({ params }) => {
        if (params.token === 'valid-token') {
          return HttpResponse.json(MOCK_CONTEXT);
        }
        return HttpResponse.json({ error: 'Invalid token' }, { status: 404 });
      })
    );
  });

  describe('submission flow (Req 4.6)', () => {
    it('submits responses via POST /api/responses and shows confirmation', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/responses', async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          // Identity comes from the session cookie, never the body (Req 12.4)
          expect(body).not.toHaveProperty('memberId');
          expect(body).toHaveProperty('sessionId', 'session-1');
          return HttpResponse.json({
            responses: [
              { questionId: 'q-delivering-value', score: 4, rollingAverage: 3.8 },
              { questionId: 'q-team-collaboration', score: 5, rollingAverage: null },
            ],
          });
        })
      );

      renderPage();

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Select scores for all questions
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show confirmation message
      await waitFor(() => {
        expect(screen.getByText(/thank you/i)).toBeInTheDocument();
      });
    });

    it('displays rolling averages per question after successful submission (Req 16.1)', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/responses', () => {
          return HttpResponse.json({
            responses: [
              { questionId: 'q-delivering-value', score: 4, rollingAverage: 3.8 },
              { questionId: 'q-team-collaboration', score: 5, rollingAverage: 4.2 },
            ],
          });
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Fill and submit
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should display rolling averages
      await waitFor(() => {
        expect(screen.getByText(/3\.8/)).toBeInTheDocument();
        expect(screen.getByText(/4\.2/)).toBeInTheDocument();
      });
    });

    it('shows "more responses needed" when rolling average is null (Req 16.5)', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/responses', () => {
          return HttpResponse.json({
            responses: [
              { questionId: 'q-delivering-value', score: 4, rollingAverage: null },
              { questionId: 'q-team-collaboration', score: 5, rollingAverage: null },
            ],
          });
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Fill and submit
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show "more responses needed" messages (one per question)
      await waitFor(() => {
        const messages = screen.getAllByText(/more responses needed/i);
        expect(messages.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('session ended handling (Req 4.9)', () => {
    it('shows "session ended" immediately when the loaded session is closed', async () => {
      server.use(
        http.get('/api/auth/session-link/:token', () => {
          return HttpResponse.json({ ...MOCK_CONTEXT, sessionStatus: 'closed' });
        })
      );

      renderPage();

      expect(await screen.findByRole('heading', { name: /session ended/i })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /delivering value/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    });

    it('shows "session ended" message when API returns 409 (session closed)', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/responses', () => {
          return HttpResponse.json(
            { error: { code: 'SESSION_CLOSED', message: 'Session has ended' } },
            { status: 409 }
          );
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Fill and submit
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show session ended message
      await waitFor(() => {
        expect(screen.getByText(/session ended/i)).toBeInTheDocument();
      });
    });
  });

  describe('network error handling (Req 4.10)', () => {
    it('retains user input on network error', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/responses', () => {
          return HttpResponse.error();
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Fill scores
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));

      // Submit
      await user.click(screen.getByRole('button', { name: /submit/i }));

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/failed|error|retry/i)).toBeInTheDocument();
      });

      // Input should be retained
      expect(within(dvGroup).getByRole('radio', { name: '4' })).toBeChecked();
      expect(within(tcGroup).getByRole('radio', { name: '5' })).toBeChecked();
    });
  });

  describe('POST body structure', () => {
    it('sends only sessionId and responses, leaving identity to the cookie', async () => {
      const user = userEvent.setup();
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post('/api/responses', async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            responses: [
              { questionId: 'q-delivering-value', score: 4, rollingAverage: null },
              { questionId: 'q-team-collaboration', score: 5, trendIndicator: 'improving', rollingAverage: null },
            ],
          });
        })
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
      });

      // Fill scores and trend
      const dvGroup = screen.getByRole('group', { name: /delivering value/i });
      await user.click(within(dvGroup).getByRole('radio', { name: '4' }));

      const tcGroup = screen.getByRole('group', { name: /team collaboration/i });
      await user.click(within(tcGroup).getByRole('radio', { name: '5' }));
      await user.click(within(tcGroup).getByRole('button', { name: /improving/i }));

      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(capturedBody).not.toBeNull();
      });

      // Requirement 12.4: the server derives the member from the session cookie,
      // so sending an identity in the body would be ignored at best and
      // misleading at worst
      expect(capturedBody).toEqual({
        sessionId: 'session-1',
        responses: [
          { questionId: 'q-delivering-value', score: 4 },
          { questionId: 'q-team-collaboration', score: 5, trendIndicator: 'improving' },
        ],
      });
    });
  });
});

/**
 * Submitting has an ending.
 *
 * Requirements: Explaining Itself 2.1, 2.2, 2.4, 2.5
 * Property: 3
 *
 * A member answered on production, pressed the button, and got a page that
 * gave no sign the answers could still be changed — so pressing the button
 * again looked like submitting twice. The tool allows revision until close,
 * and a member who believes their answers are final answers more cautiously.
 */
describe('after a member submits', () => {
  /** Answers every question and presses the button. */
  async function answerAndSubmit(user: ReturnType<typeof userEvent.setup>, score = 4) {
    await screen.findByRole('group', { name: /delivering value/i });

    for (const name of [/delivering value/i, /team collaboration/i]) {
      const group = screen.getByRole('group', { name });
      await user.click(within(group).getByRole('radio', { name: String(score) }));
    }

    await user.click(screen.getByRole('button', { name: /responses/i }));
  }

  beforeEach(() => {
    // A sibling of the describe above, so it needs its own link context:
    // the shared handler serves a different question catalogue.
    server.use(
      http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
      http.post('/api/responses', () =>
        HttpResponse.json({
          responses: [
            { questionId: 'q-delivering-value', score: 4, rollingAverage: 3.8 },
            { questionId: 'q-team-collaboration', score: 4, rollingAverage: null },
          ],
        }),
      ),
    );
  });

  it('says the answers were saved', async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAndSubmit(user);

    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
  });

  it('says they can still be changed until the check closes', async () => {
    // The fact that stops a member treating their first answer as final
    const user = userEvent.setup();
    renderPage();

    await answerAndSubmit(user);

    expect(await screen.findByRole('status')).toHaveTextContent(/until.*closes/i);
  });

  it('leaves the form in place rather than replacing it with a receipt', async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAndSubmit(user);

    await screen.findByRole('status');
    expect(screen.getByRole('group', { name: /delivering value/i })).toBeInTheDocument();
  });

  it('leaves the answers editable, which is the claim the message makes', async () => {
    /*
     * A form that is present but frozen would make the confirmation a lie.
     * Asserted by changing an answer, not by reading an attribute.
     */
    const user = userEvent.setup();
    renderPage();

    await answerAndSubmit(user);
    await screen.findByRole('status');

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));

    expect(within(group).getByRole('radio', { name: '2' })).toBeChecked();
  });

  it('still shows what the team is averaging, which is why a member looks', async () => {
    const user = userEvent.setup();
    renderPage();

    await answerAndSubmit(user);

    expect(await screen.findByText(/recent team average: 3.8/i)).toBeInTheDocument();
  });
});

/**
 * Requirements: Explaining Itself 2.4
 *
 * The page is what knows whether this member has answered — on arrival, from
 * the link context, and after a submission, from having just made one.
 */
describe('the control on a check that has already been answered', () => {
  it('offers to update when the member arrives with answers already saved', async () => {
    server.use(
      http.get('/api/auth/session-link/:token', () =>
        HttpResponse.json({
          ...MOCK_CONTEXT,
          responses: [{ questionId: 'q-delivering-value', score: 3, trendIndicator: null }],
        }),
      ),
    );

    renderPage();

    expect(await screen.findByRole('button', { name: /update/i })).toBeInTheDocument();
  });

  it('offers to submit when the member has not answered yet', async () => {
    server.use(
      http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
    );

    renderPage();

    expect(await screen.findByRole('button', { name: /^submit/i })).toBeInTheDocument();
  });

  it('changes to update the moment a submission succeeds, without a reload', async () => {
    /*
     * The state the member was actually in when they pressed the button a
     * second time and asked what had just happened.
     */
    const user = userEvent.setup();
    server.use(
      http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
      http.post('/api/responses', () =>
        HttpResponse.json({ responses: [{ questionId: 'q-delivering-value', score: 4, rollingAverage: 4 }] }),
      ),
    );

    renderPage();
    await screen.findByRole('group', { name: /delivering value/i });

    for (const name of [/delivering value/i, /team collaboration/i]) {
      const group = screen.getByRole('group', { name });
      await user.click(within(group).getByRole('radio', { name: '4' }));
    }
    await user.click(screen.getByRole('button', { name: /^submit/i }));

    expect(await screen.findByRole('button', { name: /update/i })).toBeInTheDocument();
  });
});
