/**
 * Tests for the profile segment layout.
 * Requirements: Manager Experience 1.1, 1.7
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import ProfileLayout from './layout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/me',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('profile segment layout', () => {
  it('wraps the profile page in the navigation shell', async () => {
    render(
      <ProfileLayout>
        <p>Profile page</p>
      </ProfileLayout>,
    );

    expect(await screen.findByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });

  it('marks the profile as the current destination from this segment', async () => {
    render(
      <ProfileLayout>
        <p>Profile page</p>
      </ProfileLayout>,
    );

    expect(await screen.findByRole('link', { name: /profile/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
