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
  }

  return { record };
}
