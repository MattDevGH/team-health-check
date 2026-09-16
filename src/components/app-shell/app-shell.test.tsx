/**
 * Tests for the authenticated navigation shell.
 * Requirements: Manager Experience 1.1, 1.2, 1.5
 *
 * TDD: Red phase — these tests define the expected behaviour before the
 * component exists.
 *
 * The shell wraps authenticated pages. It is **given** the member's team and
 * roles by the layout, which resolves them on the server, and offers the
 * destinations that member can actually reach. Assertions are on what a user
 * and a screen reader are given: the landmark, the link names and targets, tab
 * order, and which destination is announced as current.
 *
 * It used to fetch `/api/me` itself, and these tests used to vary the answer
 * through MSW. Passing a prop instead is not only simpler: the in-flight state
 * those tests described no longer exists, which is the point of the change.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { AppShell } from './app-shell';
import type { ShellContext } from './destinations';
import { useCanManage } from './shell-context';

const mockPathname = vi.hoisted(() => ({ current: '/teams/team-1/dashboard' }));
const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => mockRouter,
}));

beforeEach(() => {
  mockRouter.push.mockClear();
  mockRouter.refresh.mockClear();
});

/** A signed-in Delivery Manager, which is the common case. */
const MANAGER: ShellContext = {
  team: { id: 'team-1', name: 'Platform Squad' },
  roles: ['delivery_manager'],
};

/** The same member without the role that earns the audit log. */
const CONTRIBUTOR: ShellContext = { team: { id: 'team-1', name: 'Platform Squad' }, roles: [] };

function renderShell(pathname: string, context: ShellContext | null = MANAGER) {
  mockPathname.current = pathname;
  return render(
    <AppShell context={context}>
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

  it('renders page content even when there is no member to build a shell for', async () => {
    renderShell('/teams/team-1/dashboard', null);

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

  it('omits what a contributor would be refused, and keeps what they can use', async () => {
    /*
     * Explaining Itself 3.1 and 3.2. Settings joined the audit log behind the
     * role: every write behind it is manager-only, so offering it to a
     * contributor advertised a page that would refuse them.
     *
     * The dashboard stays, deliberately. Its data is aggregate and anonymised,
     * and a team should be able to read its own results.
     */
    renderShell('/teams/team-1/dashboard', CONTRIBUTOR);

    // Still asserts a present destination before an absent one, so this cannot
    // pass against a shell that rendered nothing at all
    await screen.findByRole('link', { name: /dashboard/i });

    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /health check/i })).toBeInTheDocument();
  });

  it('offers a Delivery Manager both', async () => {
    renderShell('/teams/team-1/dashboard', MANAGER);

    expect(await screen.findByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/teams/team-1/settings',
    );
    expect(screen.getByRole('link', { name: /audit log/i })).toBeInTheDocument();
  });

  // Requirement 1.7, and Feeling Responsive 2.1

  it('offers every destination in its first render, with nothing to wait for', () => {
    /*
     * The pop-in, as a unit test. This used to render the destinations it could
     * name without a team id, then the rest when a fetch resolved — which a
     * delivery manager saw as the menu filling in.
     *
     * Synchronous queries on purpose: `findBy` would pass either way, because
     * it waits for exactly the second render this asserts does not happen.
     */
    renderShell('/teams/team-1/dashboard');

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /health check/i })).toBeInTheDocument();
  });

  it('does not guess a team id when the team could not be resolved', async () => {
    // A member whose team row cannot be read. Team-scoped links built from a
    // guessed id would 404; the ones that need no id still work.
    renderShell('/teams/team-1/dashboard', { team: null, roles: [] });

    await screen.findByRole('navigation', { name: /main/i });

    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('renders no navigation at all when there is no member', async () => {
    // The layout resolves nobody — no cookie, an expired session, or a database
    // it could not reach — and passes null rather than an empty shell
    renderShell('/teams/team-1/dashboard', null);

    await screen.findByRole('heading', { name: 'Page content' });

    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /skip to main content/i })).not.toBeInTheDocument();
  });

  // Requirement 1.4: sign out revokes the session server-side. Clearing the
  // cookie in the browser alone would leave a working session token on record.

  describe('sign out', () => {
    /** Counts real POSTs crossing the network boundary, not calls to our own code. */
    function countLogoutRequests(status = 204): () => number {
      let count = 0;
      server.use(
        http.post('/api/auth/logout', () => {
          count += 1;
          return new HttpResponse(null, { status });
        }),
      );
      return () => count;
    }

    it('revokes the session server-side and returns the member to the home page', async () => {
      const user = userEvent.setup();
      const logoutCount = countLogoutRequests();
      renderShell('/teams/team-1/dashboard');

      await user.click(await screen.findByRole('button', { name: /sign out/i }));

      await waitFor(() => expect(logoutCount()).toBe(1));
      await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/'));
    });

    it('discards the cached authenticated pages behind it', async () => {
      // Without this, going Back after signing out re-renders a cached
      // authenticated page from the client router cache
      const user = userEvent.setup();
      countLogoutRequests();
      renderShell('/teams/team-1/dashboard');

      await user.click(await screen.findByRole('button', { name: /sign out/i }));

      await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    });

    it('keeps the member where they are when the session could not be revoked', async () => {
      const user = userEvent.setup();
      countLogoutRequests(500);
      renderShell('/teams/team-1/dashboard');

      await user.click(await screen.findByRole('button', { name: /sign out/i }));

      expect(await screen.findByRole('status')).toHaveTextContent(/could not sign you out/i);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('does not navigate before the server has answered', async () => {
      const user = userEvent.setup();
      server.use(
        http.post('/api/auth/logout', async () => {
          await delay('infinite');
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderShell('/teams/team-1/dashboard');

      await user.click(await screen.findByRole('button', { name: /sign out/i }));

      // A shell that navigates optimistically would tell the member they are
      // signed out while their session token is still valid
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});

/**
 * Feeling Responsive 1.2.
 *
 * A layout cannot pass props to the page it wraps, so the shell offers the
 * context it was given to everything inside it. Without this the dashboard
 * would quietly lose its Delivery-Manager controls — it takes the roles from
 * here, and a missing provider reads exactly like a member without the role.
 *
 * Added after a mutation survived: removing the provider from the shell broke
 * nothing, because every other test supplies the context directly.
 */
describe('what the shell offers the page inside it', () => {
  function RoleProbe() {
    return <p>{useCanManage() ? 'can manage' : 'cannot manage'}</p>;
  }

  function renderProbe(context: ShellContext | null) {
    mockPathname.current = '/teams/team-1/dashboard';
    return render(
      <AppShell context={context}>
        <RoleProbe />
      </AppShell>,
    );
  }

  it('passes the roles through to a page that asks for them', () => {
    renderProbe(MANAGER);

    expect(screen.getByText('can manage')).toBeInTheDocument();
  });

  it('passes a contributor through as a contributor', () => {
    renderProbe(CONTRIBUTOR);

    expect(screen.getByText('cannot manage')).toBeInTheDocument();
  });

  it('offers nothing behind a role when there is no member', () => {
    renderProbe(null);

    expect(screen.getByText('cannot manage')).toBeInTheDocument();
  });
});
