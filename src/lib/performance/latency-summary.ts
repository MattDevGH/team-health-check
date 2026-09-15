/**
 * Turning latency samples into a number worth comparing.
 *
 * Requirements: Feeling Responsive 5.1, 5.3
 *
 * Used by `scripts/measure-production.ts`, which is a deliberate command rather
 * than a gate. Wall-clock measurements belong nowhere near CI: they vary with
 * the machine, they fail on a slow morning, and a test that fails for reasons
 * unrelated to the change is a test somebody disables.
 */

export interface LatencySummary {
  /** Milliseconds. */
  min: number;
  median: number;
  max: number;
  samples: number;
}

/**
 * The median, the spread, and how many samples there were.
 *
 * The median rather than the mean: a cold start is an order of magnitude slower
 * than a warm request, and an average of the two describes neither. The spread
 * is reported alongside so a reader can see when that has happened.
 */
export function summarise(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    throw new Error('Cannot summarise: no samples were taken');
  }

  // A copy, because sorting in place would reorder the caller's array
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

  return {
    min: sorted[0],
    median,
    max: sorted[sorted.length - 1],
    samples: sorted.length,
  };
}

/**
 * What one database round trip appears to cost, or null when it cannot be told.
 *
 * The difference between an endpoint that runs a single query and one that runs
 * none. Everything else about the two requests is the same — the same network,
 * the same function, the same cold-start risk — so what remains is the database.
 *
 * Null rather than a negative or zero number. Within one region a query costs
 * single-digit milliseconds, which is close enough to the spread between two
 * runs that the subtraction can come out negative; reporting that as a cost
 * would be reporting noise as a finding.
 */
export function impliedQueryCost(
  withQuery: LatencySummary,
  withoutQuery: LatencySummary,
): number | null {
  const difference = withQuery.median - withoutQuery.median;
  return difference > 0 ? difference : null;
}
