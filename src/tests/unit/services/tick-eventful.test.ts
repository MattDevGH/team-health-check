/**
 * Which ticks are worth keeping.
 *
 * Requirements: Remembering What Happened 2.1, 2.2, 2.3
 * Properties: 2 (quiet ticks never enter the ledger), 3 (eventful ones always do)
 *
 * cron-job.org keeps the most recent fifty executions, which on a weekly
 * cadence is the least interesting fifty: a team that opens Monday and closes
 * Friday produces perhaps three eventful ticks out of two thousand, and they are
 * evicted within hours by the quiet ones behind them.
 *
 * So what is kept is chosen by what happened rather than by when. This is the
 * function that decides, and it is pure — a predicate over the summary the tick
 * already produced, which is what stops it drifting from what the tick reported.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { isEventful, type TickOutcome } from '@/lib/services/tick-eventful';

/**
 * A tick as a caller actually has it — the whole summary, with fields the
 * predicate has no interest in.
 *
 * Through a variable rather than a literal, because TypeScript's excess
 * property check only fires on literals and the point being tested is what a
 * real caller does: hand over the summary whole rather than unpick it first.
 */
function wholeSummary(outcome: TickOutcome, extra: Record<string, unknown>): TickOutcome {
  return { ...outcome, ...extra };
}

const QUIET = {
  opened: 0,
  closed: 0,
  materialised: 0,
  prompts: 0,
  failures: 0,
};

describe('a tick that changed something', () => {
  it.each([
    ['opened a check', { opened: 1 }],
    ['closed one', { closed: 1 }],
    ['computed results', { materialised: 1 }],
    ['prompted somebody', { prompts: 1 }],
  ])('is worth keeping when it %s', (_what, change) => {
    expect(isEventful({ ...QUIET, ...change })).toBe(true);
  });
});

describe('a tick that did nothing', () => {
  it('is not worth keeping', () => {
    /*
     * The whole point. Quiet ticks are the overwhelming majority, and keeping
     * them is what destroyed the cron dashboard's window — the heartbeat
     * already says the scheduler ran.
     */
    expect(isEventful(QUIET)).toBe(false);
  });

  it('is not worth keeping however many teams it passed over', () => {
    // Passing over fourteen teams because none of them was due is the normal
    // state of a Wednesday, not an event
    expect(isEventful(wholeSummary(QUIET, { skipped: 14 }))).toBe(false);
  });
});

describe('a tick that failed', () => {
  it('is worth keeping although every count is zero', () => {
    /*
     * The single most valuable row the ledger will hold, and the one a
     * count-based rule would throw away.
     *
     * `session.materialise.failed` is retried on the next tick — for ever, if
     * the cause is permanent. A tick that opened nothing, closed nothing and
     * failed to materialise a session is eventful precisely *because* nothing
     * happened.
     */
    expect(isEventful({ ...QUIET, failures: 1 })).toBe(true);
  });

  it('is worth keeping even when it also did plenty', () => {
    // Requirement 2.2: a failure is kept regardless of what else was true
    expect(isEventful({ opened: 3, closed: 2, materialised: 5, prompts: 9, failures: 1 })).toBe(
      true,
    );
  });
});

describe('the rule, over any tick at all', () => {
  /*
   * Small counts, deliberately.
   *
   * A first version generated up to 50 of each and did **not** catch a
   * predicate that ignored `failures` — the case that exposes it needs four
   * counts at zero and one above it, and fast-check rarely produced that
   * combination among a hundred runs of wide ranges. The example test caught
   * it and the property test did not, which is the wrong way round.
   *
   * Ranges of 0..2 make all-but-one-zero common rather than rare.
   */
  const counts = fc.nat({ max: 2 });
  const facts = fc.record({
    opened: counts,
    closed: counts,
    materialised: counts,
    prompts: counts,
    failures: counts,
  });

  it('keeps a tick if and only if it did something or failed', () => {
    /*
     * Generated rather than exampled because the property is about every tick
     * the system can produce. A substring of the rule — checking `opened`
     * alone, say — passes several of the example tests above and fails here.
     */
    fc.assert(
      fc.property(facts, tick => {
        const somethingHappened =
          tick.opened + tick.closed + tick.materialised + tick.prompts + tick.failures > 0;

        expect(isEventful(tick)).toBe(somethingHappened);
      }),
      { numRuns: 500 },
    );
  });

  it('keeps a tick on the strength of any single count, one at a time', () => {
    /*
     * Each field on its own, which is what a rule that quietly ignores one of
     * them fails. Enumerated rather than generated: there are five, and the
     * cost of leaving it to chance was that the mutation survived.
     */
    const fields = ['opened', 'closed', 'materialised', 'prompts', 'failures'] as const;

    for (const field of fields) {
      expect(isEventful({ ...QUIET, [field]: 1 }), `${field} alone should be enough`).toBe(true);
    }
  });

  it('never depends on how long the tick took or what it was called', () => {
    // Eventfulness is about what happened, so a slow quiet tick is still quiet
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), fc.string(), (durationMs, tickId) => {
        expect(isEventful(wholeSummary(QUIET, { durationMs, tickId }))).toBe(false);
      }),
    );
  });
});
