/**
 * Tests for the profile segment layout.
 * Requirements: Manager Experience 1.1, 1.7; Feeling Responsive 1.1, 2.1
 *
 * An async Server Component, like the team layout: it resolves the member
 * before the HTML is sent. Rendering it means awaiting the component, since
 * React Testing Library renders elements and an async component is a function
 * that returns a promise of one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import ProfileLayout from './layout';
import type { ShellContext } from '@/components/app-shell/destinations';

const resolved = vi.hoisted(() => ({ context: null as ShellContext | null }));

vi.mock('@/lib/auth/shell-context.server', () => ({
  currentShellContext: async () => resolved.context,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/me',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  resolved.context = { team: { id: 'team-1', name: 'Platform Squad' }, roles: [] };
});

async function renderLayout() {
  return render(await ProfileLayout({ children: <p>Profile page</p> }));
}

describe('profile segment layout', () => {
  it('wraps the profile page in the navigation shell', async () => {
    await renderLayout();

    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });

  it('marks the profile as the current destination from this segment', async () => {
    await renderLayout();

    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('aria-current', 'page');
  });

  it('renders the page with no shell when nobody could be resolved', async () => {
    resolved.context = null;

    await renderLayout();

    expect(screen.getByText('Profile page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
