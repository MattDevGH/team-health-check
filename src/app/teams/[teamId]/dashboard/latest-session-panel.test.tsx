/**
 * Tests for the Latest Session panel.
 * Requirements: Manager Experience 3.5, 3.6
 *
 * TDD: Red phase.
 *
 * The panel this replaces listed response counts under a heading promising the
 * latest session — a manager could see that six people answered and not what
 * they said.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { LatestSessionPanel } from './latest-session-panel';

const TWO_SESSIONS = [
  {
    sessionId: 's1',
    closedAt: '2026-08-01T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 6 },
      { questionId: 'q-ease-of-delivery', averageScore: 3.0, responseCount: 6 },
    ],
  },
  {
    sessionId: 's2',
    closedAt: '2026-08-08T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.9, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 3.6, responseCount: 6 },
      { questionId: 'q-ease-of-delivery', averageScore: 3.0, responseCount: 5 },
    ],
  },
];

function row(name: RegExp | string) {
  return within(screen.getByRole('row', { name }));
}

describe('LatestSessionPanel', () => {
  it('says which session it is describing', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    expect(screen.getByRole('region', { name: /latest session/i })).toHaveTextContent(
      /8 august 2026/i,
    );
  });

  it('gives each question its score and how many answered', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    const delivering = row(/delivering value/i);
    expect(delivering.getByText('3.9')).toBeInTheDocument();
    expect(delivering.getByText(/6 responses/i)).toBeInTheDocument();
  });

  it('states the direction of change in words, not by symbol alone', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    // An arrow or a colour would leave a screen reader user with a bare number
    expect(row(/delivering value/i).getByText(/0\.4 higher/i)).toBeInTheDocument();
    expect(row(/team collaboration/i).getByText(/0\.4 lower/i)).toBeInTheDocument();
    expect(row(/ease of delivery/i).getByText(/unchanged/i)).toBeInTheDocument();
  });

  it('says so plainly when there is nothing to compare against', () => {
    render(<LatestSessionPanel sessions={[TWO_SESSIONS[1]]} anonymousMode={false} />);

    expect(row(/delivering value/i).getByText(/first check/i)).toBeInTheDocument();
  });

  it('says a value is hidden rather than leaving it blank', () => {
    const sparse = [
      {
        sessionId: 's3',
        closedAt: '2026-08-15T17:00:00.000Z',
        averages: [{ questionId: 'q-delivering-value', averageScore: 4.5, responseCount: 2 }],
      },
    ];

    render(<LatestSessionPanel sessions={sparse} anonymousMode={true} />);

    const delivering = row(/delivering value/i);
    expect(delivering.getByText(/hidden until 3 people have answered/i)).toBeInTheDocument();
    // The score itself must not leak: two people's answers are identifiable
    expect(delivering.queryByText('4.5')).not.toBeInTheDocument();
  });

  it('shows values normally when the team is not anonymous', () => {
    const sparse = [
      {
        sessionId: 's3',
        closedAt: '2026-08-15T17:00:00.000Z',
        averages: [{ questionId: 'q-delivering-value', averageScore: 4.5, responseCount: 2 }],
      },
    ];

    render(<LatestSessionPanel sessions={sparse} anonymousMode={false} />);

    expect(row(/delivering value/i).getByText('4.5')).toBeInTheDocument();
  });

  it('renders nothing when no session has closed', () => {
    const { container } = render(<LatestSessionPanel sessions={[]} anonymousMode={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
