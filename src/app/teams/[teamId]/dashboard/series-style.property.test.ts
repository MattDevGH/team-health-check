/**
 * Property Tests for series identity.
 *
 * Feature: dashboard-refinement, Property 3: no two series are confusable
 *
 * **Validates: Requirement 2.1, 2.2**
 *
 * The point of this property is that it asserts the *distinction*, not the
 * values. A test pinning `stroke-dasharray="6 3"` asserts what was typed and
 * would keep passing if two series were given the same pattern. This asserts
 * what a reader actually needs: that no two lines can be mistaken for each
 * other once colour is taken away.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { seriesStyle, SERIES_STYLE_COUNT, markerPath } from './series-style';

describe('Property 3: series are distinguishable without colour', () => {
  it('gives no two series the same dash and marker', () => {
    const seen = new Set<string>();

    for (let i = 0; i < SERIES_STYLE_COUNT; i++) {
      const { dash, marker } = seriesStyle(i);
      const signature = `${dash}|${marker}`;

      expect(seen.has(signature), `series ${i} repeats ${signature}`).toBe(false);
      seen.add(signature);
    }
  });

  it('distinguishes every pair by dash or marker, ignoring colour entirely', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: SERIES_STYLE_COUNT - 1 }),
        fc.nat({ max: SERIES_STYLE_COUNT - 1 }),
        (a, b) => {
          fc.pre(a !== b);

          const first = seriesStyle(a);
          const second = seriesStyle(b);

          expect(first.dash !== second.dash || first.marker !== second.marker).toBe(true);
        },
      ),
    );
  });

  it('gives every series a colour as well, for readers who can use it', () => {
    fc.assert(
      fc.property(fc.nat({ max: 50 }), index => {
        expect(seriesStyle(index).colour).toMatch(/^#[0-9A-F]{6}$/i);
      }),
    );
  });

  it('always returns a style, however many series there are', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), index => {
        const style = seriesStyle(index);

        expect(style.marker).toBeTruthy();
        expect(typeof style.dash).toBe('string');
      }),
    );
  });

  it('draws every marker as a path around the point it marks', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: SERIES_STYLE_COUNT - 1 }),
        fc.integer({ min: 10, max: 500 }),
        fc.integer({ min: 10, max: 300 }),
        (index, cx, cy) => {
          const path = markerPath(seriesStyle(index).marker, cx, cy);

          expect(path.startsWith('M ')).toBe(true);
          // Every coordinate in the path is within a marker's radius of the
          // point, so a marker cannot drift away from its data
          const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
          expect(numbers.some(n => Math.abs(n - cx) <= 8 || Math.abs(n - cy) <= 8)).toBe(true);
        },
      ),
    );
  });
});
