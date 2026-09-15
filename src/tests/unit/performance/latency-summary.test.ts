/**
 * Summarising a handful of latency samples.
 *
 * Requirements: Feeling Responsive 5.1, 5.3
 *
 * "The app seems generally a little slow" is not something a suite can answer,
 * and the measurement that answered it was a row of curl invocations nobody
 * wrote down. This is the part of that command worth testing: turning samples
 * into a number, and subtracting one endpoint from another to isolate what the
 * database costs.
 *
 * The median rather than the mean, because a cold start is an order of
 * magnitude slower than a warm request and would drag an average somewhere no
 * request ever went.
 */

import { describe, expect, it } from 'vitest';

import { summarise, impliedQueryCost } from '@/lib/performance/latency-summary';

describe('summarise', () => {
  it('reports the middle sample of an odd number', () => {
    expect(summarise([100, 300, 200]).median).toBe(200);
  });

  it('averages the middle two of an even number', () => {
    expect(summarise([100, 200, 300, 400]).median).toBe(250);
  });

  it('reports the fastest and slowest, so a cold start is visible rather than hidden', () => {
    /*
     * The median is what to compare; the spread is what says whether to trust
     * it. A run whose max is ten times its median has measured a cold start and
     * a warm one, and averaging those would describe neither.
     */
    const summary = summarise([90, 100, 110, 1130]);

    expect(summary.min).toBe(90);
    expect(summary.max).toBe(1130);
  });

  it('counts the samples it summarised', () => {
    expect(summarise([1, 2, 3]).samples).toBe(3);
  });

  it('does not order the caller’s array as a side effect', () => {
    // Sorting in place would reorder the samples the caller still holds
    const samples = [300, 100, 200];

    summarise(samples);

    expect(samples).toEqual([300, 100, 200]);
  });

  it('refuses to summarise nothing rather than reporting zero', () => {
    // A measurement of nothing is not a measurement of something fast
    expect(() => summarise([])).toThrow(/no samples/i);
  });

  it('summarises a single sample as itself, while saying how few there were', () => {
    const summary = summarise([42]);

    expect(summary).toMatchObject({ min: 42, median: 42, max: 42, samples: 1 });
  });
});

describe('impliedQueryCost', () => {
  it('is the difference between an endpoint that queries and one that does not', () => {
    // 249ms against 189ms was 60ms per query, across the Atlantic
    const withQuery = summarise([240, 249, 260]);
    const withoutQuery = summarise([185, 189, 195]);

    expect(impliedQueryCost(withQuery, withoutQuery)).toBe(60);
  });

  it('reports nothing measurable when the difference is lost in the noise', () => {
    /*
     * Within Dublin a query costs single-digit milliseconds, which is close
     * enough to the spread between two runs that the subtraction can come out
     * negative. Reporting a negative cost would be reporting nonsense.
     */
    const withQuery = summarise([100, 101, 102]);
    const withoutQuery = summarise([103, 104, 105]);

    expect(impliedQueryCost(withQuery, withoutQuery)).toBeNull();
  });

  it('reports a cost of zero as nothing measurable, not as free', () => {
    const same = summarise([100, 100, 100]);

    expect(impliedQueryCost(same, same)).toBeNull();
  });
});
