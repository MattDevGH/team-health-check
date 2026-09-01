/**
 * Property Tests for trend chart geometry.
 *
 * Feature: dashboard-refinement
 * - Property 1: positions are monotonically non-decreasing in close date, and
 *   equal dates give equal positions
 * - Property 2: every position falls inside the plot area
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property 1 is the one that matters. It says the chart cannot misrepresent
 * time for *any* set of dates — that a later session never plots to the left of
 * an earlier one, and that two sessions closed at the same moment never appear
 * to be apart. The example tests check a handful of arrangements; a real team
 * produces arrangements nobody wrote an example for.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { sessionPositions, PLOT_LEFT, PLOT_RIGHT } from './chart-geometry';

const EPOCH = Date.UTC(2026, 0, 1);

/**
 * Close dates drawn from a bounded pool of whole days, so duplicates and ties
 * genuinely occur. Fully random instants would almost never collide, leaving
 * the equal-dates case untested.
 */
const closedAtArb = fc
  .integer({ min: 0, max: 400 })
  .map(days => new Date(EPOCH + days * 86_400_000).toISOString());

const sessionsArb = fc.array(closedAtArb, { minLength: 1, maxLength: 12 });

describe('Property 1: time is represented monotonically', () => {
  it('never plots a later session to the left of an earlier one', () => {
    fc.assert(
      fc.property(sessionsArb, dates => {
        const sorted = [...dates].sort();
        const xs = sessionPositions(sorted);

        for (let i = 1; i < xs.length; i++) {
          expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
        }
      }),
    );
  });

  it('gives equal dates equal positions', () => {
    fc.assert(
      fc.property(sessionsArb, dates => {
        const xs = sessionPositions(dates);

        for (let i = 0; i < dates.length; i++) {
          for (let j = 0; j < dates.length; j++) {
            if (dates[i] === dates[j]) expect(xs[i]).toBe(xs[j]);
          }
        }
      }),
    );
  });

  it('preserves the ratio of gaps, which is what makes a slope meaningful', () => {
    fc.assert(
      fc.property(closedAtArb, closedAtArb, closedAtArb, (a, b, c) => {
        const dates = [a, b, c].sort();
        const [t0, t1, t2] = dates.map(d => new Date(d).getTime());
        // Only meaningful when the outer points differ
        fc.pre(t2 > t0);

        const [x0, x1, x2] = sessionPositions(dates);
        const timeFraction = (t1 - t0) / (t2 - t0);
        const spaceFraction = (x1 - x0) / (x2 - x0);

        expect(spaceFraction).toBeCloseTo(timeFraction, 6);
      }),
    );
  });
});

describe('Property 2: every point is inside the plot', () => {
  it('never places a session outside the drawable area', () => {
    fc.assert(
      fc.property(sessionsArb, dates => {
        for (const x of sessionPositions(dates)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(PLOT_LEFT);
          expect(x).toBeLessThanOrEqual(PLOT_RIGHT);
        }
      }),
    );
  });

  it('returns one position per session, whatever the dates', () => {
    fc.assert(
      fc.property(sessionsArb, dates => {
        expect(sessionPositions(dates)).toHaveLength(dates.length);
      }),
    );
  });
});
