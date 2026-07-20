/**
 * Tests for the Magic Link Verification page.
 * Requirements: 7.3, 7.9
 *
 * TDD: Red phase — these tests define the expected behaviour
 * before the component is implemented.
 *
 * The page verifies a magic link token on mount and either:
 * - Redirects to dashboard (authenticated state)
 * - Shows a team creation form (genesis state)
 * - Displays an error (expired/invalid token)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import MagicLinkPage from '@/app/auth/magic/[token]/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function mockAuthenticatedResponse() {
  server.use(
    http.get('/api/auth/magic-link/verify/:token', () => {
      return HttpResponse.json({
        status: 'authenticated',
        memberId: 'member-1',
        sessionToken: 'session-token-abc',
      });
    }),
  );
}

function mockGenesisResponse() {
  server.use(
    http.get('/api/auth/magic-link/verify/:token', () => {
      return HttpResponse.json({
        status: 'requires_team_creation',
        pendingToken: 'pending-token-xyz',
        email: 'alice@example.com',
      });
    }),
  );
}

function mockInvalidToken() {
  server.use(
    http.get('/api/auth/magic-link/verify/:token', () => {
      return HttpResponse.json(
        { error: 'Magic link is expired or has already been used' },
        { status: 404 },
      );
    }),
  );
}

function mockNetworkError() {
  server.use(
    http.get('/api/auth/magic-link/verify/:token', () => {
      return HttpResponse.error();
    }),
  );
}

describe('Magic Link Verification Page', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('Loading state', () => {
    it('displays a loading indicator while verifying the token', () => {
      mockAuthenticatedResponse();
      render(<MagicLinkPage params={Promise.resolve({ token: 'some-token' })} />);

      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });
  });

  describe('Authenticated state (Requirement 7.3)', () => {
    beforeEach(() => {
      mockAuthenticatedResponse();
    });

    it('redirects to the dashboard when token is valid and user is authenticated', async () => {
      render(<MagicLinkPage params={Promise.resolve({ token: 'valid-token' })} />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Genesis state — team creation (Requirement 7.9)', () => {
    beforeEach(() => {
      mockGenesisResponse();
    });

    it('displays a team creation form when user needs to create a team', async () => {
      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /create.*team/i })).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create team/i })).toBeInTheDocument();
    });

    it('displays the user email for context', async () => {
      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
      });
    });

    it('submits team creation form to /api/teams/genesis', async () => {
      const user = userEvent.setup();
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post('/api/teams/genesis', async ({ request }) => {
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(
            { teamId: 'team-1', memberId: 'member-1', sessionToken: 'new-session' },
            { status: 201 },
          );
        }),
      );

      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/team name/i), 'My Awesome Team');
      await user.type(screen.getByLabelText(/description/i), 'A great team');
      await user.click(screen.getByRole('button', { name: /create team/i }));

      await waitFor(() => {
        expect(capturedBody).toEqual({
          token: 'pending-token-xyz',
          teamName: 'My Awesome Team',
          description: 'A great team',
        });
      });
    });

    it('redirects to dashboard after successful team creation', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/teams/genesis', () => {
          return HttpResponse.json(
            { teamId: 'team-1', memberId: 'member-1', sessionToken: 'new-session' },
            { status: 201 },
          );
        }),
      );

      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/team name/i), 'My Team');
      await user.click(screen.getByRole('button', { name: /create team/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('validates that team name is required', async () => {
      const user = userEvent.setup();

      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
      });

      // Submit with empty name
      await user.click(screen.getByRole('button', { name: /create team/i }));

      await waitFor(() => {
        expect(screen.getByText(/team name is required/i)).toBeInTheDocument();
      });

      // Should NOT have navigated
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('displays an error when genesis API returns a failure', async () => {
      const user = userEvent.setup();

      server.use(
        http.post('/api/teams/genesis', () => {
          return HttpResponse.json(
            { error: 'Token is already used or expired' },
            { status: 409 },
          );
        }),
      );

      render(<MagicLinkPage params={Promise.resolve({ token: 'genesis-token' })} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/team name/i), 'My Team');
      await user.click(screen.getByRole('button', { name: /create team/i }));

      await waitFor(() => {
        expect(screen.getByText(/already used or expired/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error state (expired/invalid token)', () => {
    it('displays an error message for expired or invalid tokens', async () => {
      mockInvalidToken();

      render(<MagicLinkPage params={Promise.resolve({ token: 'expired-token' })} />);

      await waitFor(() => {
        expect(screen.getByText(/expired or has already been used/i)).toBeInTheDocument();
      });
    });

    it('offers a link to request a new magic link', async () => {
      mockInvalidToken();

      render(<MagicLinkPage params={Promise.resolve({ token: 'expired-token' })} />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
      });
    });
  });

  describe('Network error', () => {
    it('displays a generic error on network failure', async () => {
      mockNetworkError();

      render(<MagicLinkPage params={Promise.resolve({ token: 'any-token' })} />);

      await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      });
    });
  });
});
