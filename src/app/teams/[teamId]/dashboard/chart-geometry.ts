/**
 * Where sessions sit along the trend chart's horizontal axis.
 * Requirements: Dashboard Refinement 1.1, 1.2, 1.3
 *
 * Positions come from *when* a session closed, not from its place in the list.
 * The chart previously spaced sessions evenly, so two checks a day apart and
 * two a month apart produced identical slopes — a trend line's shape is a claim
 * about rate of change, and even spacing cannot keep it.
 *
 * Kept apart from the component so the mapping can be exercised directly,
 * including the cases a rendered chart makes awkward to reach: one session, and
 * several closed at the same instant.
 */

const CHART_WIDTH = 600;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 20;

/** Leftmost and rightmost x a plotted point may occupy. */
export const PLOT_LEFT = PADDING_LEFT;
export const PLOT_RIGHT = CHART_WIDTH - PADDING_RIGHT;

const PLOT_CENTRE = (PLOT_LEFT + PLOT_RIGHT) / 2;

/**
 * Maps each session's close date to an x position, in input order.
 *
 * When every session shares a close date — including the single-session case —
 * there is no range to divide by, so they are centred rather than producing a
 * division by zero.
 */
export function sessionPositions(closedAt: string[]): number[] {
  if (closedAt.length === 0) return [];

  const times = closedAt.map(iso => new Date(iso).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const span = latest - earliest;

  if (span === 0) return times.map(() => PLOT_CENTRE);

  return times.map(time => PLOT_LEFT + ((time - earliest) / span) * (PLOT_RIGHT - PLOT_LEFT));
}
