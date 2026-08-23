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
          expect(body).toHaveProperty('memberId', 'member-1');
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
    it('sends memberId, sessionId, and responses array in correct format', async () => {
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

      expect(capturedBody).toEqual({
        memberId: 'member-1',
        sessionId: 'session-1',
        responses: [
          { questionId: 'q-delivering-value', score: 4 },
          { questionId: 'q-team-collaboration', score: 5, trendIndicator: 'improving' },
        ],
      });
    });
  });
});
