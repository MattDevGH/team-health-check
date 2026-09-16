/**
 * Writing down what a tick did, for longer than an afternoon.
 *
 * Requirements: Remembering What Happened 1.1, 1.3
 * Properties: 1 (a tick always leaves a heartbeat)
 *
 * The tick's response says what it did, and whoever is looking at the cron
 * dashboard at the time can read it. Two numbers, both checked on 2026-09-16
 * rather than assumed:
 *
 * - cron-job.org keeps the last **50 executions**, counted in ticks rather than
 *   in time — between fifty minutes and four hours depending on the interval.
 * - Vercel's Hobby plan keeps the runtime logs for **one hour**.
 *
 * So the response is gone by tomorrow, and the question this answers — "why did
 * no check open on Monday?" — is asked on Tuesday. This is the copy that is
 * still there.
 *
 * Called from the route rather than from the scheduler, because the scheduler
 * decides what to open and the route sends the prompts: only the route has the
 * whole picture, and it has already composed the sentence from both halves.
 */

import type { Recorder } from '@/lib/observability/recorder';
import type {
  SchedulerHeartbeatRepository,
  SchedulerTickRecordRepository,
} from '@/lib/repositories/types';
import { isEventful } from '@/lib/services/tick-eventful';

export interface TickRecordServiceDeps {
  schedulerHeartbeatRepo: SchedulerHeartbeatRepository;
  schedulerTickRecordRepo: SchedulerTickRecordRepository;
  /**
   * Optional, like the scheduler's. Tests and scripts should not have to wire
   * a recorder in order to do nothing with it.
   */
  recorder?: Recorder;
}

/** What a completed tick has to say for itself. */
export interface TickRecord {
  tickId: string;
  ranAt: Date;
  summary: string;
  opened: number;
  closed: number;
  materialised: number;
  prompts: number;
  /** Attempts that did not work — chiefly materialisation. */
  failures: number;
  durationMs: number;
  /** Skip reasons and their counts. */
  reasons: Record<string, number>;
}

export interface TickRecordService {
  record(tick: TickRecord): Promise<void>;
}

const NO_RECORDER: Pick<Recorder, 'error'> = { error: () => {} };

/**
 * How long a ledger entry is kept.
 *
 * Requirements: Remembering What Happened 3.1, 3.4
 *
 * Ninety days, because the question this exists to answer — "why did no check
 * open on Monday?" — is asked days later, and because a quarter is the
 * shortest span over which a weekly cadence has a shape worth looking at. The
 * alternative to somebody else's eviction policy is having one, not having
 * none.
 */
export const LEDGER_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function createTickRecordService(deps: TickRecordServiceDeps): TickRecordService {
  const { schedulerHeartbeatRepo, schedulerTickRecordRepo } = deps;
  const record_ = deps.recorder ?? NO_RECORDER;

  async function record(tick: TickRecord): Promise<void> {
    try {
      /*
       * Every tick, including one that did nothing.
       *
       * This is the criterion the whole requirement rests on. A quiet week and
       * a stopped scheduler are indistinguishable unless something is written
       * when nothing happens — which is also why the heartbeat cannot be "the
       * newest row of the ledger" once the ledger exists, since the ledger will
       * deliberately hold no quiet ticks at all.
       */
      /*
       * Mapped field by field, never spread.
       *
       * `TickRecord` is wider than `SchedulerHeartbeat` — it carries
       * `failures` and `reasons`, which the heartbeat table has no columns
       * for. TypeScript allows the wider object through, because excess
       * property checking only fires on literals, so `record(tick)` compiled
       * and would have had Prisma reject every heartbeat in production with an
       * unknown argument.
       *
       * Caught by a property test that handed the service a field nobody had
       * defined and found it in the row. Construction is not execution, and a
       * type that fits is not a row that writes.
       */
      await schedulerHeartbeatRepo.record({
        tickId: tick.tickId,
        ranAt: tick.ranAt,
        summary: tick.summary,
        opened: tick.opened,
        closed: tick.closed,
        materialised: tick.materialised,
        prompts: tick.prompts,
        durationMs: tick.durationMs,
      });

      /*
       * And the ledger, but only when the tick did something.
       *
       * The heartbeat has already said the scheduler ran, so a quiet tick has
       * nothing left to add — and writing it is exactly what leaves a record
       * holding fifty "nothing was due" entries and no trace of the morning a
       * check opened. What is kept is chosen by what happened, not by when.
       */
      if (isEventful(tick)) {
        await schedulerTickRecordRepo.append({
          tickId: tick.tickId,
          ranAt: tick.ranAt,
          summary: tick.summary,
          opened: tick.opened,
          closed: tick.closed,
          materialised: tick.materialised,
          prompts: tick.prompts,
          failures: tick.failures,
          durationMs: tick.durationMs,
          reasons: tick.reasons,
        });
      }
    } catch (error: unknown) {
      /*
       * Swallowed, because the caller is the tick.
       *
       * The route awaits this before answering, so a rejection here would turn
       * a tick that opened a check into a 500 and have the cron service report
       * a failure for work that succeeded. A scheduler that stops working
       * because it could not write down that it was working is strictly worse
       * than one that forgets it did.
       *
       * Unlike the recorder — which swallows in silence, having nowhere to
       * complain to — this has somewhere: the recorder.
       */
      record_.error('tick.record.failed', {
        tickId: tick.tickId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    /*
     * Tidying up, last and separately.
     *
     * Last, so that a prune which fails cannot cost the tick the row it came
     * to write — the housekeeping must never be paid for with the record.
     *
     * Separately, so a prune failure is not reported as a failure to record.
     * They are different faults: one loses this tick, the other lets the table
     * grow. A prune that has been silently failing for months is a table
     * nobody knows about, which is the shape of problem this milestone exists
     * to remove.
     *
     * On every tick, including a quiet one, which is what makes a scheduled
     * job of its own unnecessary. On a weekly cadence it deletes nothing
     * almost every time and costs one indexed lookup.
     */
    /*
     * A cutoff that is not a real time deletes everything.
     *
     * Every comparison against NaN is false, so `ranAt < NaN` matches nothing
     * and `ranAt >= NaN` excludes everything — depending on which way the
     * repository phrases it, the prune either does nothing or wipes the ledger
     * in the name of housekeeping. The second is unacceptable for an input
     * nobody can produce.
     *
     * Production cannot produce one: the route's clock is a real Date. A
     * property test can, because `fc.date()` generates invalid dates, and it
     * found this by deleting the row it had just written.
     */
    if (!Number.isFinite(tick.ranAt.getTime())) {
      record_.error('tick.prune.skipped', {
        tickId: tick.tickId,
        reason: 'the tick has no usable time',
      });
      return;
    }

    try {
      await schedulerTickRecordRepo.pruneBefore(
        new Date(tick.ranAt.getTime() - LEDGER_RETENTION_DAYS * DAY_MS),
      );
    } catch (error: unknown) {
      record_.error('tick.prune.failed', {
        tickId: tick.tickId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { record };
}
