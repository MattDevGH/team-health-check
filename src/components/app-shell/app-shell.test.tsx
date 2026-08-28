/**
 * Tests for the authenticated navigation shell.
 * Requirements: Manager Experience 1.1, 1.2, 1.5
 *
 * TDD: Red phase — these tests define the expected behaviour before the
 * component exists.
 *
 * The shell wraps authenticated pages. It reads the member's team and roles
 * from GET /api/me, then offers the destinations that member can actually
 * reach. Assertions are on what a user and a screen reader are given: the
 * landmark, the link names and targets, tab order, and which destination is
 * announced as current.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { AppShell } from './app-shell';

const mockPathname = vi.hoisted(() => ({ current: '/teams/team-1/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderShell(pathname: string) {
  mockPathname.current = pathname;
  return render(
    <AppShell>
      <h1>Page content</h1>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('renders a navigation landmark a screen reader can jump to', async () => {
    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('navigation', { name: /main/i })).toBeInTheDocument();
  });

  it('offers the destinations an authenticated member can reach', async () => {
    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/teams/team-1/dashboard',
    );
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/teams/team-1/settings',
    );
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/me');
  });

  it('names the team so a manager knows whose data they are looking at', async () => {
    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByText('Platform Squad')).toBeInTheDocument();
  });

  it('puts a skip link first in tab order, targeting the main content', async () => {
    const user = userEvent.setup();
    renderShell('/teams/team-1/dashboard');

    await screen.findByRole('navigation', { name: /main/i });

    await user.tab();

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveFocus();
    expect(skipLink).toHaveAttribute('href', '#main');
  });

  it('gives the skip link a target that exists', async () => {
    const { container } = renderShell('/teams/team-1/dashboard');

    await screen.findByRole('navigation', { name: /main/i });

    const main = container.querySelector('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveTextContent('Page content');
  });

  it('announces the current destination and only that one', async () => {
    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /settings/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /profile/i })).not.toHaveAttribute('aria-current');
  });

  it('follows the pathname when a different destination is open', async () => {
    renderShell('/teams/team-1/settings');

    expect(await screen.findByRole('link', { name: /settings/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current');
  });

  it('marks the profile as current on its own page, not a team destination', async () => {
    renderShell('/me');

    expect(await screen.findByRole('link', { name: /profile/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /settings/i })).not.toHaveAttribute('aria-current');
  });

  it('does not mistake a nested path for a different destination', async () => {
    // A trailing slash is still the dashboard, and must not leave every
    // destination unmarked
    renderShell('/teams/team-1/dashboard/');

    expect(await screen.findByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renders page content regardless of what /api/me returns', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 },
        ),
      ),
    );

    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('heading', { name: 'Page content' })).toBeInTheDocument();
  });

  // Requirement 1.3: destinations a member would be refused are not offered.
  // The audit log is the only Delivery-Manager-only *read* in the API — every
  // other manager-gated route is a write behind a control on a page both roles
  // can open.

  it('offers the audit log to a delivery manager', async () => {
    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('link', { name: /audit log/i })).toHaveAttribute(
      'href',
      '/teams/team-1/audit-log',
    );
  });

  it('omits the audit log from a member who would be refused it', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json({
          id: 'member-2',
          teamId: 'team-1',
          name: 'Bo',
          slackLink: null,
          team: { id: 'team-1', name: 'Platform Squad' },
          roles: [],
        }),
      ),
    );

    renderShell('/teams/team-1/dashboard');

    // Wait for the loaded state before asserting an absence, or this passes
    // against a shell that has not finished rendering anything at all
    await screen.findByRole('link', { name: /dashboard/i });

    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  // Requirement 1.7 and the in-flight state

  it('keeps the navigation landmark while /api/me is in flight', async () => {
    server.use(
      http.get('/api/me', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    renderShell('/teams/team-1/dashboard');

    expect(await screen.findByRole('navigation', { name: /main/i })).toBeInTheDocument();
  });

  it('does not guess a team id before the team is known', async () => {
    server.use(
      http.get('/api/me', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    renderShell('/teams/team-1/dashboard');

    await screen.findByRole('navigation', { name: /main/i });

    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('renders no navigation at all when the request is unauthenticated', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 },
        ),
      ),
    );

    renderShell('/teams/team-1/dashboard');

    await screen.findByRole('heading', { name: 'Page content' });

    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /skip to main content/i })).not.toBeInTheDocument();
  });

  it('renders no navigation when /api/me cannot be reached', async () => {
    server.use(http.get('/api/me', () => HttpResponse.error()));

    renderShell('/teams/team-1/dashboard');

    await screen.findByRole('heading', { name: 'Page content' });

    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });
});
