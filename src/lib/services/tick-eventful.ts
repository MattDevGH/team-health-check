/**
 * Whether a tick is worth keeping.
 *
 * Requirements: Remembering What Happened 2.1, 2.2, 2.3
 * Properties: 2 (quiet ticks never enter the ledger), 3 (eventful ones always do)
 *
 * cron-job.org keeps the most recent fifty executions, which on a weekly
 * cadence is the least interesting fifty: a team that opens Monday and closes
 * Friday produces perhaps three eventful ticks out of two thousand, and they
 * are evicted within hours by the quiet ones behind them.
 *
 * So the ledger chooses by **what happened** rather than by when. The heartbeat
 * already says the scheduler ran, so a quiet tick has nothing left to add.
 *
 * Pure, and a predicate over the summary the tick already produced rather than
 * a new concept threaded through the scheduler — which is what stops it
 * drifting from what the tick reported.
 */

/**
 * The parts of a tick that decide whether it is kept.
 *
 * Deliberately a subset: extra fields are accepted and ignored, so a caller can
 * hand over the whole summary without unpicking it first.
 */
export interface TickOutcome {
  opened: number;
  closed: number;
  materialised: number;
  prompts: number;
  /** Things that were attempted and did not work — chiefly materialisation. */
  failures: number;
}

export function isEventful(tick: TickOutcome): boolean {
  /*
   * Failures count, which is the part a purely count-based rule gets wrong.
   *
   * `session.materialise.failed` is retried on the next tick — for ever, if the
   * cause is permanent. A tick that opened nothing, closed nothing and failed
   * to materialise a session is eventful precisely *because* nothing happened,
   * and it is the most valuable row this ledger will hold.
   */
  return tick.opened + tick.closed + tick.materialised + tick.prompts + tick.failures > 0;
}
