/**
 * Writing down a tick that did not finish.
 *
 * Requirements: Remembering What Happened 1.1, 1.6
 *
 * The ledger and the heartbeat are written after the work succeeds, so until
 * this existed a tick that threw left no trace in the database at all. What it
 * did leave expired quickly: cron-job.org keeps the last fifty executions, and
 * Vercel's Hobby plan keeps one hour of runtime logs.
 *
 * That was not hypothetical. The scheduler stopped on 2026-10-11 and by the
 * time it was investigated on the 15th every trail had gone, leaving a frozen
 * heartbeat that could mean either "nothing called the endpoint" or "every call
 * failed" — two hypotheses with opposite fixes and no way to choose.
 *
 * So a failed tick now says so, in the same two places a successful one does.
 */

import { createTickRecordService } from '@/lib/services/tick-record.service';
import type { Recorder } from '@/lib/observability/recorder';
import type {
  SchedulerHeartbeatRepository,
  SchedulerTickRecordRepository,
} from '@/lib/repositories/types';

export interface TickFailureDeps {
  schedulerHeartbeatRepo: SchedulerHeartbeatRepository;
  schedulerTickRecordRepo: SchedulerTickRecordRepository;
  recorder?: Recorder;
  /** Matches the scheduler's own, so a failed tick is identified like any other. */
  newTickId?: () => string;
}

export interface TickFailure {
  now: Date;
  startedAt: number;
  error: unknown;
}

/**
 * How much of the cause is kept.
 *
 * Long enough for a stack-free database or network message to arrive whole —
 * `URL_INVALID`, `SQLITE_BUSY`, a fetch failure and its cause all fit — and
 * short enough that a driver which decides to echo a statement cannot turn one
 * row into a page.
 *
 * The residual risk is worth naming rather than pretending away: this is the
 * one place in the application where text the application did not compose is
 * stored. Driver errors name columns and constraints rather than values, so
 * nothing a member answered should reach here. If one ever did, this is where
 * it would be, and the cap bounds how much.
 */
const MAX_CAUSE = 200;

export function describeCause(error: unknown): string {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const flattened = message.replace(/\s+/g, ' ').trim();
  return flattened.length > MAX_CAUSE
    ? `${flattened.slice(0, MAX_CAUSE)}…`
    : flattened;
}

/**
 * Records the failure, and never throws.
 *
 * The caller is about to rethrow so the route answers 500. A rejection here
 * would replace the real cause with this one — losing the very thing the row
 * exists to carry — and the likeliest reason a tick failed is also the
 * likeliest reason recording it fails, since both need the same database.
 */
export async function recordFailedTick(
  deps: TickFailureDeps,
  { now, startedAt, error }: TickFailure,
): Promise<void> {
  const newTickId = deps.newTickId ?? (() => Math.random().toString(36).slice(2, 10));

  try {
    await createTickRecordService({
      schedulerHeartbeatRepo: deps.schedulerHeartbeatRepo,
      schedulerTickRecordRepo: deps.schedulerTickRecordRepo,
      recorder: deps.recorder,
    }).record({
      tickId: newTickId(),
      ranAt: now,
      summary: `Ran and could not finish: ${describeCause(error)}`,
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      /*
       * One, which is what puts the row in the ledger at all: `isEventful`
       * keeps a tick when something happened, and a tick that threw is the
       * most eventful kind there is.
       */
      failures: 1,
      durationMs: Date.now() - startedAt,
      reasons: {},
    });
  } catch (recordingError: unknown) {
    deps.recorder?.error('tick.failure.record.failed', {
      message:
        recordingError instanceof Error
          ? recordingError.message
          : String(recordingError),
    });
  }
}
