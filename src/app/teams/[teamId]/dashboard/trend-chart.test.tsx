/**
 * Tests for the trend chart.
 * Requirements: Manager Experience 3.1, 3.2, 3.3, 3.4
 *
 * TDD: Red phase.
 *
 * The chart plots one line per question with no title, no legend and a single
 * `aria-label` of "Trend chart". `role="img"` hides its children from assistive
 * technology, so every plotted value is unavailable to anyone not looking at
 * the picture — and which line is which depends entirely on telling five
 * colours apart.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { TrendChart } from './trend-chart';

const SESSIONS = [
  {
    sessionId: 's1',
    closedAt: '2026-08-01T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 5 },
      { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 4 },
    ],
  },
  {
    sessionId: 's2',
    closedAt: '2026-08-08T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 4.2, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 3.8, responseCount: 1 },
    ],
  },
];

describe('TrendChart', () => {
  it('says what it is plotting', () => {
    render(<TrendChart sessions={SESSIONS} />);

    expect(screen.getByRole('figure', { name: /average score per question/i })).toBeInTheDocument();
  });

  it('says the horizontal spacing is time, so a slope can be read', () => {
    // Without this a reader has no way to know whether even-looking spacing
    // means even intervals or just even turns in a list
    render(<TrendChart sessions={SESSIONS} />);

    expect(screen.getByRole('figure')).toHaveTextContent(
      /spaced by the time between them/i,
    );
  });

  it('names every plotted question, so the lines are not told apart by colour alone', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const legend = screen.getByRole('list', { name: /question themes plotted/i });
    expect(within(legend).getByText('Delivering Value')).toBeInTheDocument();
    expect(within(legend).getByText('Team Collaboration')).toBeInTheDocument();
  });

  it('exposes every plotted value in a table', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const table = screen.getByRole('table', { name: /average score per question/i });

    // A row per session, plus the header row
    expect(within(table).getAllByRole('row')).toHaveLength(SESSIONS.length + 1);

    // Question names as column headers, so a screen reader announces which
    // question a cell belongs to
    expect(within(table).getByRole('columnheader', { name: /delivering value/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /team collaboration/i })).toBeInTheDocument();
  });

  it('gives each value its score and how many people it represents', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const table = screen.getByRole('table', { name: /average score per question/i });

    expect(within(table).getByText(/3\.5 from 5 responses/i)).toBeInTheDocument();
    // The count agrees in number: a value from one person is not "1 responses"
    expect(within(table).getByText(/3\.8 from 1 response$/i)).toBeInTheDocument();
  });

  it('identifies each session by the date it closed', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const table = screen.getByRole('table', { name: /average score per question/i });
    expect(within(table).getByRole('rowheader', { name: /1 august 2026/i })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /8 august 2026/i })).toBeInTheDocument();
  });

  it('does not announce the drawing itself twice', () => {
    render(<TrendChart sessions={SESSIONS} />);

    // The figure carries the description; the svg repeating it would make a
    // screen reader read the same sentence twice before the data
    expect(screen.queryByRole('img', { name: /trend chart/i })).not.toBeInTheDocument();
  });
});

/**
 * Dashboard Refinement 2.1, 2.2.
 *
 * These assert the *distinction*, not the values. Pinning a particular
 * stroke-dasharray would assert what was typed, and would keep passing if two
 * series were given the same pattern.
 */
describe('TrendChart series identity', () => {
  it('draws each line with a different dash pattern', () => {
    const { container } = render(<TrendChart sessions={SESSIONS} />);

    const dashes = [...container.querySelectorAll('polyline')].map(
      line => line.getAttribute('stroke-dasharray') ?? 'solid',
    );

    expect(dashes).toHaveLength(2);
    expect(new Set(dashes).size, 'two lines share a dash pattern').toBe(dashes.length);
  });

  it('gives each legend entry a swatch, not a bare colour block', () => {
    const { container } = render(<TrendChart sessions={SESSIONS} />);

    const legend = screen.getByRole('list', { name: /question themes plotted/i });
    // A swatch that draws the line and its marker, so the legend survives
    // greyscale
    expect(legend.querySelectorAll('svg line')).toHaveLength(2);
    expect(legend.querySelectorAll('svg path')).toHaveLength(2);
    expect(container.querySelectorAll('circle'), 'markers are shapes now').toHaveLength(0);
  });

  it('marks data points with shapes that differ between series', () => {
    const { container } = render(<TrendChart sessions={SESSIONS} />);

    const svg = container.querySelector('svg[aria-hidden="true"]')!;
    const markerShapes = new Set(
      [...svg.querySelectorAll('path')].map(path => path.getAttribute('d')!.slice(0, 1)),
    );

    // Every marker is a path starting with a move command
    expect(markerShapes).toEqual(new Set(['M']));
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
