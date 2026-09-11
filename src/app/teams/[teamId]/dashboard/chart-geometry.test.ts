/**
 * Tests for trend chart geometry.
 * Requirements: Dashboard Refinement 1.1, 1.2, 1.3
 *
 * TDD: Red phase.
 *
 * Sessions were positioned by their index, so two checks a day apart and two a
 * month apart produced identical slopes. A trend line's shape is a claim about
 * rate of change; index spacing cannot keep it.
 */

import { describe, it, expect } from 'vitest';

import { answeredSpan, sessionPositions, PLOT_LEFT, PLOT_RIGHT } from './chart-geometry';

const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();

describe('sessionPositions', () => {
  it('spreads the first and last session across the plot', () => {
    const xs = sessionPositions([day(1), day(31)]);

    expect(xs[0]).toBe(PLOT_LEFT);
    expect(xs[1]).toBe(PLOT_RIGHT);
  });

  it('places a session by elapsed time, not by its turn in the list', () => {
    // Day 1, day 2, day 31: the first two are neighbours and the third is far
    // away. Index spacing would put the middle point halfway across.
    const [first, second, third] = sessionPositions([day(1), day(2), day(31)]);

    const earlyGap = second - first;
    const lateGap = third - second;

    expect(earlyGap).toBeLessThan(lateGap / 10);
  });

  it('centres a lone session, with no range to divide by', () => {
    const [only] = sessionPositions([day(5)]);

    expect(only).toBe((PLOT_LEFT + PLOT_RIGHT) / 2);
  });

  it('centres sessions that all closed at the same instant', () => {
    // Same denominator problem, and dividing by it would produce NaN
    const xs = sessionPositions([day(5), day(5), day(5)]);

    for (const x of xs) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBe((PLOT_LEFT + PLOT_RIGHT) / 2);
    }
  });

  it('gives two sessions closed on the same day the same position', () => {
    const xs = sessionPositions([day(1), day(10), day(10), day(20)]);

    expect(xs[1]).toBe(xs[2]);
  });

  it('returns nothing for no sessions', () => {
    expect(sessionPositions([])).toEqual([]);
  });

  it('positions by date even when the list is not in order', () => {
    // The chart sorts before plotting, but the mapping should not depend on it
    const xs = sessionPositions([day(31), day(1)]);

    expect(xs[0]).toBe(PLOT_RIGHT);
    expect(xs[1]).toBe(PLOT_LEFT);
  });
});

/**
 * Which checks the chart draws.
 * Requirements: Dashboard Refinement 1.4, 4.4
 *
 * A check nobody answered still happened, and when it sits between two answered
 * checks it explains why they are far apart — that is worth drawing. At either
 * end it explains nothing: it stretches the axis into space no data will ever
 * occupy, which is how two real checks ended up inside 5% of the plot.
 *
 * So the drawing spans the first answered check to the last, and unanswered
 * checks outside that span are left to the table and the latest-session panel,
 * both of which report them in full.
 */
describe('answeredSpan', () => {
  it('keeps every check when they were all answered', () => {
    expect(answeredSpan([true, true, true])).toEqual({ start: 0, end: 2 });
  });

  it('drops checks nobody answered from the end', () => {
    // The case that prompted this: two real checks, then two empty ones
    expect(answeredSpan([true, true, false, false])).toEqual({ start: 0, end: 1 });
  });

  it('drops checks nobody answered from the start', () => {
    // The mirror image, which stretches the axis left into the same dead space
    expect(answeredSpan([false, false, true, true])).toEqual({ start: 2, end: 3 });
  });

  it('keeps an unanswered check that sits between two answered ones', () => {
    // This one earns its place: it explains the gap
    expect(answeredSpan([true, false, true])).toEqual({ start: 0, end: 2 });
  });

  it('trims both ends at once while keeping the middle', () => {
    expect(answeredSpan([false, true, false, true, false])).toEqual({ start: 1, end: 3 });
  });

  it('has nothing to draw when no check was answered', () => {
    expect(answeredSpan([false, false])).toBeNull();
  });

  it('has nothing to draw when there are no checks at all', () => {
    expect(answeredSpan([])).toBeNull();
  });

  it('spans a single answered check', () => {
    expect(answeredSpan([false, true, false])).toEqual({ start: 1, end: 1 });
  });
});
