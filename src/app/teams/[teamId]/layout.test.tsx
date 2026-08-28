/**
 * Tests for the team segment layout.
 * Requirements: Manager Experience 1.1, 1.7
 *
 * Everything under /teams/[teamId] is authenticated, so the shell is mounted
 * here rather than by a runtime check inside the shell itself. A page that is
 * not in this segment cannot render the shell by accident.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import TeamLayout from './layout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('team segment layout', () => {
  it('wraps its pages in the navigation shell', async () => {
    render(
      <TeamLayout>
        <p>Team page</p>
      </TeamLayout>,
    );

    expect(await screen.findByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByText('Team page')).toBeInTheDocument();
  });

  it('provides exactly one main landmark for the page inside it', async () => {
    const { container } = render(
      <TeamLayout>
        <p>Team page</p>
      </TeamLayout>,
    );

    await screen.findByRole('navigation', { name: /main/i });

    // The shell owns the landmark. A page that also rendered one would give
    // the document two, and the skip link would land on the wrapper rather
    // than the content.
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });
});
