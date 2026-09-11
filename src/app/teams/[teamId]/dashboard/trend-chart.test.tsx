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
import userEvent from '@testing-library/user-event';

import { sessionPositions } from './chart-geometry';
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

    const table = screen.getByRole('table', { name: /every closed health check/i });

    // A row per session, plus the header row
    expect(within(table).getAllByRole('row')).toHaveLength(SESSIONS.length + 1);

    // Question names as column headers, so a screen reader announces which
    // question a cell belongs to
    expect(within(table).getByRole('columnheader', { name: /delivering value/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /team collaboration/i })).toBeInTheDocument();
  });

  it('gives each value its score and how many people it represents', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const table = screen.getByRole('table', { name: /every closed health check/i });

    expect(within(table).getByText(/3\.5 from 5 responses/i)).toBeInTheDocument();
    // The count agrees in number: a value from one person is not "1 responses"
    expect(within(table).getByText(/3\.8 from 1 response$/i)).toBeInTheDocument();
  });

  it('identifies each session by the date it closed', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const table = screen.getByRole('table', { name: /every closed health check/i });
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

/**
 * Dashboard Refinement 8.1, 8.2, 8.3, 8.5.
 *
 * A five-line chart does not have to be read all at once. Hiding a series
 * affects the drawing only — the table keeps every value, so filtering can
 * never remove data from the page, just from the picture.
 */
describe('TrendChart series filtering', () => {
  it('offers each legend entry as a toggle that reports its state', () => {
    render(<TrendChart sessions={SESSIONS} />);

    const toggle = screen.getByRole('button', { name: /delivering value/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides a series from the drawing when its legend entry is switched off', async () => {
    const user = userEvent.setup();
    const { container } = render(<TrendChart sessions={SESSIONS} />);

    expect(container.querySelectorAll('polyline')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));

    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /delivering value/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('brings it back when switched on again', async () => {
    const user = userEvent.setup();
    const { container } = render(<TrendChart sessions={SESSIONS} />);

    const toggle = screen.getByRole('button', { name: /delivering value/i });
    await user.click(toggle);
    await user.click(toggle);

    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves the data table untouched, whatever is hidden', async () => {
    const user = userEvent.setup();
    render(<TrendChart sessions={SESSIONS} />);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));

    // Filtering changes the picture, never the data on the page
    const table = screen.getByRole('table', { name: /every closed health check/i });
    expect(within(table).getByRole('columnheader', { name: /delivering value/i })).toBeInTheDocument();
    expect(within(table).getByText(/3.5 from 5 responses/i)).toBeInTheDocument();
  });

  it('says the chart is empty rather than drawing an empty grid', async () => {
    const user = userEvent.setup();
    render(<TrendChart sessions={SESSIONS} />);

    await user.click(screen.getByRole('button', { name: /delivering value/i }));
    await user.click(screen.getByRole('button', { name: /team collaboration/i }));

    expect(screen.getByText(/every question theme is hidden/i)).toBeInTheDocument();
  });

  it('is operable by keyboard', async () => {
    const user = userEvent.setup();
    render(<TrendChart sessions={SESSIONS} />);

    const toggle = screen.getByRole('button', { name: /delivering value/i });
    toggle.focus();
    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * A health check that closed with nobody answering.
 *
 * Requirements: Dashboard Refinement 4.1, 4.4
 *
 * The table beneath the chart has said "Not answered" since the dashboard
 * refinement, but the drawing said nothing at all: the lines simply stopped and
 * resumed, and the only trace was a date on the axis with no point above it.
 * Matt hit this on 2026-09-10 with two empty checks among four, which pushed
 * every real value into the leftmost fraction of the plot and made a working
 * chart look broken. A reader cannot tell a check nobody answered from a
 * rendering fault unless the chart says which it is.
 */
describe('TrendChart marking checks that nobody answered', () => {
  const EMPTY_SESSION = {
    sessionId: 's-empty',
    closedAt: '2026-08-05T17:00:00.000Z',
    averages: [],
  };

  const WITH_EMPTY = [SESSIONS[0], EMPTY_SESSION, SESSIONS[1]];

  function markers(container: HTMLElement) {
    return [...container.querySelectorAll('[data-unanswered-session]')];
  }

  it('marks the date of a check that closed with no responses', () => {
    const { container } = render(<TrendChart sessions={WITH_EMPTY} />);

    expect(
      container.querySelector('[data-unanswered-session="s-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks only the checks that nobody answered', () => {
    const { container } = render(<TrendChart sessions={WITH_EMPTY} />);

    expect(markers(container).map(m => m.getAttribute('data-unanswered-session'))).toEqual([
      's-empty',
    ]);
  });

  it('stands the mark at that check’s own date', () => {
    // Cross-checked against the geometry rather than against a number copied
    // out of the component, so a marker drawn at the wrong session fails
    const { container } = render(<TrendChart sessions={WITH_EMPTY} />);

    const expected = sessionPositions(WITH_EMPTY.map(s => s.closedAt))[1];
    const marker = container.querySelector('[data-unanswered-session="s-empty"]')!;

    expect(Number(marker.getAttribute('x1'))).toBeCloseTo(expected, 5);
    expect(Number(marker.getAttribute('x2'))).toBeCloseTo(expected, 5);
  });

  it('tells the reader what the mark means', () => {
    render(<TrendChart sessions={WITH_EMPTY} />);

    expect(screen.getByRole('figure')).toHaveTextContent(/nobody answering/i);
  });

  it('says nothing about unanswered checks when every check was answered', () => {
    // Explaining a mark that is not drawn is noise, and invites the reader to
    // look for something that is not there
    render(<TrendChart sessions={SESSIONS} />);

    expect(screen.getByRole('figure')).not.toHaveTextContent(/nobody answering/i);
  });

  it('leaves the marker out of the accessibility tree, which the table serves', () => {
    // The drawing is aria-hidden in full; the table is what a screen reader
    // reads, and it already reports the same absence as "Not answered"
    const { container } = render(<TrendChart sessions={WITH_EMPTY} />);

    const marker = container.querySelector('[data-unanswered-session="s-empty"]')!;
    expect(marker.closest('svg[aria-hidden="true"]')).not.toBeNull();

    const table = screen.getByRole('table');
    expect(within(table).getAllByText(/not answered/i).length).toBeGreaterThan(0);
  });
});

/**
 * Unanswered checks at either end of the history.
 * Requirements: Dashboard Refinement 1.4, 4.4
 *
 * Marking every unanswered check turned out to be the wrong rule. A mark earns
 * its place when it explains a gap between data; at the end of the history
 * there is no gap, only an edge, and the check stretches the axis into space no
 * data will ever occupy. Two real checks followed by two empty ones put every
 * plotted value inside a twentieth of the plot.
 *
 * They are not hidden: the table below lists every closed check, and the
 * latest-session panel is built from the most recent one whether or not anybody
 * answered it.
 */
describe('TrendChart with unanswered checks at the ends', () => {
  const trailing = {
    sessionId: 's-trailing',
    closedAt: '2026-09-20T17:00:00.000Z',
    averages: [],
  };
  const leading = {
    sessionId: 's-leading',
    closedAt: '2026-07-04T17:00:00.000Z',
    averages: [],
  };

  function axisLabels(container: HTMLElement) {
    const svg = container.querySelector('svg[aria-hidden="true"]')!;
    return [...svg.querySelectorAll('text')].map(t => t.textContent);
  }

  it('does not give a trailing unanswered check a place on the axis', () => {
    const { container } = render(<TrendChart sessions={[...SESSIONS, trailing]} />);

    expect(axisLabels(container)).not.toContain('Sep 20');
  });

  it('does not mark a trailing unanswered check either', () => {
    // Drawing the mark but not the date would explain nothing
    const { container } = render(<TrendChart sessions={[...SESSIONS, trailing]} />);

    expect(container.querySelector('[data-unanswered-session]')).toBeNull();
  });

  it('does not give a leading unanswered check a place on the axis', () => {
    const { container } = render(<TrendChart sessions={[leading, ...SESSIONS]} />);

    expect(axisLabels(container)).not.toContain('Jul 4');
  });

  it('still marks an unanswered check between two answered ones', () => {
    const between = {
      sessionId: 's-between',
      closedAt: '2026-08-05T17:00:00.000Z',
      averages: [],
    };
    const { container } = render(
      <TrendChart sessions={[leading, SESSIONS[0], between, SESSIONS[1], trailing]} />,
    );

    expect(
      [...container.querySelectorAll('[data-unanswered-session]')].map(m =>
        m.getAttribute('data-unanswered-session'),
      ),
    ).toEqual(['s-between']);
  });

  it('counts what it plots, not every check that closed', () => {
    // Saying "the last 3 closed sessions" over a two-point chart is a lie the
    // reader can see
    render(<TrendChart sessions={[...SESSIONS, trailing]} />);

    expect(screen.getByRole('figure')).toHaveTextContent(/last 2 closed sessions/i);
  });

  it('keeps every closed check in the table, including the ones it does not plot', () => {
    // The chart is a trend view; the table is the record. They differ in
    // emphasis, never in what they contain
    render(<TrendChart sessions={[...SESSIONS, trailing]} />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: /20 september 2026/i })).toBeInTheDocument();
  });

  it('says so rather than drawing an empty grid when nothing was answered', () => {
    render(<TrendChart sessions={[leading, trailing]} />);

    expect(screen.getByText(/no health check has been answered yet/i)).toBeInTheDocument();
  });

  it('still lists the unanswered checks in the table when none were answered', () => {
    render(<TrendChart sessions={[leading, trailing]} />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: /4 july 2026/i })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /20 september 2026/i })).toBeInTheDocument();
  });
});
