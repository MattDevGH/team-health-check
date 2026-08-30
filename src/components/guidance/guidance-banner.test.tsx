/**
 * Tests for the guidance banner.
 * Requirements: Manager Experience 4.1, 4.2, 4.6
 *
 * TDD: Red phase.
 *
 * Guidance is derived from loaded data every render, never stored and never
 * dismissible. A banner that can be dismissed while still true is a banner that
 * stops telling the truth.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { GuidanceBanner } from './guidance-banner';

describe('GuidanceBanner', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<GuidanceBanner items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('is announced as a region a manager can find', () => {
    render(
      <GuidanceBanner items={[{ id: 'members', message: 'Add the rest of your team.' }]} />,
    );

    expect(screen.getByRole('region', { name: /next steps/i })).toBeInTheDocument();
  });

  it('shows each piece of guidance as its own item', () => {
    render(
      <GuidanceBanner
        items={[
          { id: 'members', message: 'Add the rest of your team.' },
          { id: 'schedule', message: 'Choose when checks open and close.' },
        ]}
      />,
    );

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(/add the rest of your team/i)).toBeInTheDocument();
    expect(within(list).getByText(/choose when checks open and close/i)).toBeInTheDocument();
  });

  it('links to where the work is actually done', () => {
    render(
      <GuidanceBanner
        items={[
          {
            id: 'members',
            message: 'Add the rest of your team.',
            action: { href: '/teams/team-1/settings', label: 'Go to team settings' },
          },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /go to team settings/i })).toHaveAttribute(
      'href',
      '/teams/team-1/settings',
    );
  });

  it('offers no way to dismiss guidance', () => {
    // Guidance disappears when its condition stops being true and not before.
    // A dismiss control would let a manager hide advice that still applies.
    render(
      <GuidanceBanner items={[{ id: 'members', message: 'Add the rest of your team.' }]} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
