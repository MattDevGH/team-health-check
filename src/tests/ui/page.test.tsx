/**
 * Tests for the homepage.
 *
 * The homepage is where every successful sign-in lands: magic-link
 * verification and genesis both `push('/')` once the session cookie is set.
 * Until now it was a static marketing page whose primary action was "Sign in
 * with magic link", so signing in delivered a member to an invitation to sign
 * in, with no way into the app but to know a URL. Found by hand on 2026-09-10;
 * the E2E suite asserted the landing URL was `/` and called that a pass.
 *
 * Fixing it here rather than at the redirect fixes every caller at once —
 * magic link, genesis, and anyone who simply types the address.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { server } from '../mocks/server';
import Home from '@/app/page';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
  }),
}));

/** The signed-out response the real route returns without a session cookie. */
function mockSignedOut() {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      ),
    ),
  );
}

describe('Home page', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  describe('when signed in', () => {
    // The default handler answers as an authenticated member of team-1

    it('sends the member to their own team dashboard', async () => {
      render(<Home />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/teams/team-1/dashboard');
      });
    });

    it('replaces rather than pushes, so Back does not bounce forward again', async () => {
      // push would leave `/` in the history immediately behind the dashboard,
      // and going Back would redirect straight forward — a trap with no exit
      render(<Home />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    });

    it('does not offer to sign in someone who already is', async () => {
      render(<Home />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalled());

      expect(
        screen.queryByRole('link', { name: /sign in/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('when signed out', () => {
    beforeEach(() => {
      mockSignedOut();
    });

    it('shows the sign-in route into the app', async () => {
      render(<Home />);

      const signIn = await screen.findByRole('link', { name: /sign in/i });
      expect(signIn).toHaveAttribute('href', '/auth/login');
    });

    it('stays put rather than redirecting', async () => {
      render(<Home />);

      await screen.findByRole('link', { name: /sign in/i });
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('still explains what the product is', async () => {
      render(<Home />);

      expect(
        await screen.findByRole('heading', { level: 1, name: /team health check/i }),
      ).toBeInTheDocument();
    });
  });

  describe('when signed in without a resolvable team', () => {
    beforeEach(() => {
      server.use(
        http.get('/api/me', () =>
          HttpResponse.json({
            id: 'member-1',
            teamId: 'team-1',
            name: 'Alice',
            email: 'alice@example.com',
            slackLink: null,
            team: null,
            roles: [],
          }),
        ),
      );
    });

    it('does not invent a dashboard URL it cannot resolve', async () => {
      // A guessed team id produces a link that 404s. The Prisma foreign key
      // makes this unreachable in production, but guessing is worse than
      // leaving the member on a page that explains itself.
      render(<Home />);

      await screen.findByRole('heading', { level: 1 });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});

/**
 * A page that has been left must not navigate.
 *
 * Requirements: Manager Experience 1.1
 *
 * `current` guarded the state update but not the redirect, so a fetch that
 * resolved after unmount still called `router.replace`. In the suite that
 * surfaced as a flake: a signed-in test's in-flight request landed during a
 * later signed-out test and failed an assertion that nothing had navigated.
 *
 * CI caught it; a local run did not, because the leak depends on how long the
 * request takes relative to the next test starting.
 *
 * It is not only a test problem. A member who clicks away from a slow-loading
 * homepage should not be yanked to a dashboard a moment later.
 */
describe('Home page after the reader has left', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('does not navigate once it has been unmounted', async () => {
    const { unmount } = render(<Home />);
    unmount();

    // Long enough for the in-flight /api/me to resolve and try to redirect
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
