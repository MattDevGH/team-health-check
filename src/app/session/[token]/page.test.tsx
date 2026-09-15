/**
 * Tests for Session Link Page — response submission and confirmation
 * Requirements: 4.6, 4.9, 16.1, 16.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
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

/**
 * Requirements: Explaining Itself 2.5
 * Property: 3 — submission is idempotent and visible
 *
 * "I hit submit responses again — interested to know what happened here."
 * Nothing happened, and nothing said so.
 */
describe('pressing the button a second time', () => {
  let posts = 0;

  beforeEach(() => {
    posts = 0;
    server.use(
      http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
      http.post('/api/responses', () => {
        posts += 1;
        return HttpResponse.json({ responses: [{ questionId: 'q-delivering-value', score: 4, rollingAverage: 4 }] });
      }),
    );
  });

  async function answerEverything(user: ReturnType<typeof userEvent.setup>, score: string) {
    await screen.findByRole('group', { name: /delivering value/i });
    for (const name of [/delivering value/i, /team collaboration/i]) {
      const group = screen.getByRole('group', { name });
      await user.click(within(group).getByRole('radio', { name: score }));
    }
  }

  it('says nothing changed, rather than letting it look like a second answer', async () => {
    const user = userEvent.setup();
    renderPage();

    await answerEverything(user, '4');
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('button', { name: /update/i });

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
  });

  it('still says the answers are saved, since they are', async () => {
    // "No changes" on its own could read as a refusal
    const user = userEvent.setup();
    renderPage();

    await answerEverything(user, '4');
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('button', { name: /update/i });

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/saved|recorded/i);
    });
  });

  it('sends the answers anyway, so a save that failed earlier still lands', async () => {
    /*
     * Idempotent at the server, so re-sending costs nothing — and skipping it
     * would strand a member whose first attempt failed, which is the case
     * where pressing the button again is exactly the right instinct.
     */
    const user = userEvent.setup();
    renderPage();

    await answerEverything(user, '4');
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('button', { name: /update/i });

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => expect(posts).toBe(2));
  });

  it('reports a real change as saved rather than as nothing', async () => {
    const user = userEvent.setup();
    renderPage();

    await answerEverything(user, '4');
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('button', { name: /update/i });

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).not.toHaveTextContent(/no changes/i);
    });
  });

  it('treats an answer changed and changed back as no change at all', async () => {
    // A dirty flag would call this a revision. It is not one.
    const user = userEvent.setup();
    renderPage();

    await answerEverything(user, '4');
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('button', { name: /update/i });

    const group = screen.getByRole('group', { name: /delivering value/i });
    await user.click(within(group).getByRole('radio', { name: '2' }));
    await user.click(within(group).getByRole('radio', { name: '4' }));
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes/i);
    });
  });
});

/**
 * A way onward, for whoever is actually reading.
 *
 * Requirements: Explaining Itself 2.3, NFR 2.1
 *
 * Opening a session link signs the member in until the check closes, so in
 * practice everyone who reaches this confirmation has somewhere to go. The
 * spec assumed otherwise and a browser test corrected it.
 *
 * The link is still offered only on a confirmed session, because the cases
 * where there is none are real and bad to get wrong: a browser refusing
 * cookies, or a session that expired when the check closed. Sending either of
 * those to `/me` is sending them to a sign-in page dressed as a destination.
 */
describe('where a member goes after answering', () => {
  async function submitAs(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('group', { name: /delivering value/i });
    for (const name of [/delivering value/i, /team collaboration/i]) {
      const group = screen.getByRole('group', { name });
      await user.click(within(group).getByRole('radio', { name: '4' }));
    }
    await user.click(screen.getByRole('button', { name: /^submit/i }));
    await screen.findByRole('status');
  }

  function signedIn() {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ id: 'member-1', team: { id: 'team-1' }, roles: [] }),
      ),
    );
  }

  function signedOut() {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
      ),
    );
  }

  beforeEach(() => {
    server.use(
      http.get('/api/auth/session-link/:token', () => HttpResponse.json(MOCK_CONTEXT)),
      http.post('/api/responses', () => HttpResponse.json({ responses: [] })),
    );
  });

  it('offers a signed-in member their health check page', async () => {
    const user = userEvent.setup();
    signedIn();
    renderPage();

    await submitAs(user);

    const link = await screen.findByRole('link', { name: /health check/i });
    expect(link).toHaveAttribute('href', '/me/health-check');
  });

  it('offers nothing when the application does not recognise the reader', async () => {
    /*
     * A browser refusing cookies, or a session that expired as the check
     * closed. A link into /me would send them to a sign-in page, which is a
     * dead end wearing the clothes of a way onward.
     */
    const user = userEvent.setup();
    signedOut();
    renderPage();

    await submitAs(user);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('still confirms the answers where no link applies', async () => {
    // The confirmation is the point; the link is a bonus for those it fits
    const user = userEvent.setup();
    signedOut();
    renderPage();

    await submitAs(user);

    expect(screen.getByRole('status')).toHaveTextContent(/saved/i);
  });

  it('does not ask who is reading until there is something to offer them', async () => {
    // Every anonymous visit would otherwise make a request whose only possible
    // answer is 401
    let asked = 0;
    server.use(http.get('/api/me', () => { asked += 1; return HttpResponse.json({}, { status: 401 }); }));

    renderPage();
    await screen.findByRole('group', { name: /delivering value/i });

    expect(asked).toBe(0);
  });

  it('has no axe-detectable violations once confirmed, signed in', async () => {
    const user = userEvent.setup();
    signedIn();
    const { container } = renderPage();

    await submitAs(user);
    await screen.findByRole('link', { name: /health check/i });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe-detectable violations once confirmed, signed out', async () => {
    const user = userEvent.setup();
    signedOut();
    const { container } = renderPage();

    await submitAs(user);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('puts the way onward in the keyboard path, not only on screen', async () => {
    /*
     * The confirmation appears above the form, so tabbing forward from the
     * button never reaches it. Asserted by moving focus the way a keyboard
     * user would rather than by reading a tabindex.
     */
    const user = userEvent.setup();
    signedIn();
    renderPage();

    await submitAs(user);
    const link = await screen.findByRole('link', { name: /health check/i });

    link.focus();
    expect(link).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(link).not.toHaveFocus();
  });
});
