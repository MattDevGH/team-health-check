/**
 * Tests for the User Profile / Preferences page (/me).
 * Requirements: 13.1, 15.1, 15.2, 12.1, 17.1, 17.2, 17.5, 2.6, NFR 4.3, NFR 4.4, 14.7
 *
 * TDD: Red phase — these tests define expected behaviour for the
 * user profile page before implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import ProfilePage from '@/app/me/page';

const MOCK_PROFILE = {
  id: 'member-1',
  name: 'Alice',
  email: 'alice@example.com',
  cadencePreference: 'session',
  remindersEnabled: true,
  currentStreak: 5,
  bestStreak: 8,
  slackLink: { slackUserId: 'U123' },
  privacyMode: 'anonymous',
};

function mockProfileApi(profile = MOCK_PROFILE) {
  server.use(
    http.get('/api/me', () => {
      return HttpResponse.json(profile);
    }),
    http.get('/api/me/streak', () => {
      return HttpResponse.json({
        currentStreak: profile.currentStreak ?? 5,
        bestStreak: profile.bestStreak ?? 8,
      });
    }),
  );
}

function mockProfileApiError() {
  server.use(
    http.get('/api/me', () => {
      return HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
    }),
  );
}

describe('Profile Page', () => {
  describe('Loading and error states', () => {
    it('displays loading state initially', () => {
      mockProfileApi();
      render(<ProfilePage />);
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays error message when API fails', async () => {
      mockProfileApiError();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 13.1: User profile display', () => {
    beforeEach(() => mockProfileApi());

    it('renders the user name and email', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
      });
    });
  });

  describe('Requirement 15.1, 15.2: Cadence preference', () => {
    beforeEach(() => mockProfileApi());

    it('displays current cadence preference', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/weekly/i)).toBeInTheDocument();
      });
    });

    it('allows toggling cadence preference', async () => {
      server.use(
        http.patch('/api/me/preferences', async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_PROFILE, cadencePreference: body.cadencePreference });
        }),
      );
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/weekly/i)).toBeInTheDocument();
      });

      const microPulseButton = screen.getByRole('button', { name: /micro.pulse/i });
      await user.click(microPulseButton);

      await waitFor(() => {
        expect(microPulseButton).toHaveAttribute('aria-pressed', 'true');
      });
    });
  });

  describe('Requirement 13.1: Reminders enable/disable', () => {
    beforeEach(() => mockProfileApi());

    it('displays current reminder status', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /reminder/i })).toBeInTheDocument();
      });
    });

    it('allows toggling reminders', async () => {
      server.use(
        http.patch('/api/me/preferences', async ({ request }) => {
          const body = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ ...MOCK_PROFILE, remindersEnabled: body.remindersEnabled });
        }),
      );
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /reminder/i })).toBeChecked();
      });

      await user.click(screen.getByRole('switch', { name: /reminder/i }));

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /reminder/i })).not.toBeChecked();
      });
    });
  });

  describe('Requirement 12.1: Availability date range picker', () => {
    beforeEach(() => mockProfileApi());

    it('displays availability section with date inputs', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/away from/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/away until/i)).toBeInTheDocument();
    });

    it('submits availability with date range', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      server.use(
        http.post('/api/me/availability', async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ id: 'avail-1' }, { status: 201 });
        }),
      );
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/away from/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/away from/i), '2025-02-01');
      await user.type(screen.getByLabelText(/away until/i), '2025-02-10');
      await user.click(screen.getByRole('button', { name: /mark away/i }));

      await waitFor(() => {
        expect(capturedBody).not.toBeNull();
      });
      expect(capturedBody!.awayFrom).toBe('2025-02-01');
      expect(capturedBody!.awayUntil).toBe('2025-02-10');
    });
  });

  describe('Requirement 17.1, 17.2: Streak display (de-emphasised)', () => {
    beforeEach(() => mockProfileApi());

    it('displays current streak', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/5/)).toBeInTheDocument();
      });
    });

    it('displays best streak', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/8/)).toBeInTheDocument();
      });
    });

    it('streak section is de-emphasised (muted styling)', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByTestId('streak-section')).toHaveClass('text-gray-500');
      });
    });
  });

  describe('Requirement 2.6: Slack unlink', () => {
    beforeEach(() => mockProfileApi());

    it('displays Slack linked status and unlink button', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/slack linked/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /unlink slack/i })).toBeInTheDocument();
    });

    it('shows confirmation before unlinking', async () => {
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink slack/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /unlink slack/i }));

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('calls DELETE /api/me/slack-link on confirmation', async () => {
      let deleteCalled = false;
      server.use(
        http.delete('/api/me/slack-link', () => {
          deleteCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink slack/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /unlink slack/i }));
      await user.click(screen.getByRole('button', { name: /confirm/i }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });
    });

    it('does not show unlink when no Slack is linked', async () => {
      mockProfileApi({ ...MOCK_PROFILE, slackLink: null as unknown as typeof MOCK_PROFILE.slackLink });
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /unlink slack/i })).not.toBeInTheDocument();
    });
  });

  describe('Requirements 2.2, 2.3, 2.4, 7.1, 7.2: Slack pairing-code input', () => {
    it('shows a pairing-code input and link button when no Slack is linked', async () => {
      mockProfileApi({ ...MOCK_PROFILE, slackLink: null as unknown as typeof MOCK_PROFILE.slackLink });
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /link slack/i })).toBeInTheDocument();
    });

    it('submits the entered code to POST /api/auth/slack-pairing', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      server.use(
        http.post('/api/auth/slack-pairing', async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({ linked: true, slackUserId: 'U123' });
        }),
      );
      mockProfileApi({ ...MOCK_PROFILE, slackLink: null as unknown as typeof MOCK_PROFILE.slackLink });
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/pairing code/i), 'ABC123');
      await user.click(screen.getByRole('button', { name: /link slack/i }));

      await waitFor(() => {
        expect(capturedBody).toEqual({ code: 'ABC123' });
      });
    });

    it('shows linked status after a successful pairing without requiring reload', async () => {
      server.use(
        http.post('/api/auth/slack-pairing', () => {
          return HttpResponse.json({ linked: true, slackUserId: 'U123' });
        }),
      );
      mockProfileApi({ ...MOCK_PROFILE, slackLink: null as unknown as typeof MOCK_PROFILE.slackLink });
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/pairing code/i), 'ABC123');
      await user.click(screen.getByRole('button', { name: /link slack/i }));

      await waitFor(() => {
        expect(screen.getByText(/slack linked/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/pairing code/i)).not.toBeInTheDocument();
    });

    it('shows an error message for an invalid or expired code', async () => {
      server.use(
        http.post('/api/auth/slack-pairing', () => {
          return HttpResponse.json(
            { error: { code: 'NOT_FOUND', message: 'Invalid, expired, or already used pairing code' } },
            { status: 404 },
          );
        }),
      );
      mockProfileApi({ ...MOCK_PROFILE, slackLink: null as unknown as typeof MOCK_PROFILE.slackLink });
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/pairing code/i), 'WRONG1');
      await user.click(screen.getByRole('button', { name: /link slack/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid.*expired/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/pairing code/i)).toBeInTheDocument();
    });
  });

  describe('Requirement NFR 4.3: Delete my data', () => {
    beforeEach(() => mockProfileApi());

    it('displays delete my data section', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete my data/i })).toBeInTheDocument();
      });
    });

    it('requires typing DELETE for confirmation', async () => {
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete my data/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete my data/i }));

      // Confirmation input should appear
      expect(screen.getByLabelText(/type DELETE/i)).toBeInTheDocument();

      // Submit button should be disabled until "DELETE" is typed
      const confirmDeleteBtn = screen.getByRole('button', { name: /confirm deletion/i });
      expect(confirmDeleteBtn).toBeDisabled();

      await user.type(screen.getByLabelText(/type DELETE/i), 'DELETE');
      expect(confirmDeleteBtn).toBeEnabled();
    });

    it('calls POST /api/me/delete-data after confirmed', async () => {
      let deleteCalled = false;
      server.use(
        http.post('/api/me/delete-data', () => {
          deleteCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );
      mockProfileApi();
      const user = userEvent.setup();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete my data/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete my data/i }));
      await user.type(screen.getByLabelText(/type DELETE/i), 'DELETE');
      await user.click(screen.getByRole('button', { name: /confirm deletion/i }));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });
    });
  });

  describe('Requirement 14.7: Privacy mode display', () => {
    beforeEach(() => mockProfileApi());

    it('displays current privacy mode', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/anonymous/i)).toBeInTheDocument();
      });
    });
  });
});
