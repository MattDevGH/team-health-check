/**
 * Tests for the team segment layout.
 * Requirements: Manager Experience 1.1, 1.7; Feeling Responsive 1.1, 2.1
 *
 * Everything under /teams/[teamId] is authenticated, so the shell is mounted
 * here rather than by a runtime check inside the shell itself. A page that is
 * not in this segment cannot render the shell by accident.
 *
 * The layout is an async Server Component now: it resolves the member before
 * the HTML is sent, so the navigation arrives complete rather than filling in
 * after a fetch. Rendering it here means awaiting the component itself — React
 * Testing Library renders elements, and an async component is a function that
 * returns a promise of one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import TeamLayout from './layout';
import type { ShellContext } from '@/components/app-shell/destinations';

const resolved = vi.hoisted(() => ({ context: null as ShellContext | null }));

vi.mock('@/lib/auth/shell-context.server', () => ({
  currentShellContext: async () => resolved.context,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  resolved.context = { team: { id: 'team-1', name: 'Platform Squad' }, roles: ['delivery_manager'] };
});

/** Awaits the layout, then renders what it returned. */
async function renderLayout() {
  return render(await TeamLayout({ children: <p>Team page</p> }));
}

describe('team segment layout', () => {
  it('wraps its pages in the navigation shell', async () => {
    await renderLayout();

    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByText('Team page')).toBeInTheDocument();
  });

  it('provides exactly one main landmark for the page inside it', async () => {
    const { container } = await renderLayout();

    // The shell owns the landmark. A page that also rendered one would give
    // the document two, and the skip link would land on the wrapper rather
    // than the content.
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('hands the shell a context that is already resolved', async () => {
    /*
     * The change this milestone is for. The destinations are in the first
     * render, with no request to wait for — asserted synchronously, because
     * `findBy` would wait for exactly the second render this says never
     * happens.
     */
    await renderLayout();

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/teams/team-1/dashboard',
    );
    expect(screen.getByRole('link', { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByText('Platform Squad')).toBeInTheDocument();
  });

  it('renders the page with no shell when nobody could be resolved', async () => {
    // An expired session, no cookie, or a database that could not be reached.
    // The page still renders and explains itself; the navigation does not
    // pretend the member is signed in.
    resolved.context = null;

    await renderLayout();

    expect(screen.getByText('Team page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
