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

import type { SchedulerHeartbeatRepository } from '@/lib/repositories/types';

export interface TickRecordServiceDeps {
  schedulerHeartbeatRepo: SchedulerHeartbeatRepository;
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
  durationMs: number;
}

export interface TickRecordService {
  record(tick: TickRecord): Promise<void>;
}

export function createTickRecordService(deps: TickRecordServiceDeps): TickRecordService {
  const { schedulerHeartbeatRepo } = deps;

  async function record(tick: TickRecord): Promise<void> {
    /*
     * Every tick, including one that did nothing.
     *
     * This is the criterion the whole requirement rests on. A quiet week and a
     * stopped scheduler are indistinguishable unless something is written when
     * nothing happens — which is also why the heartbeat cannot be "the newest
     * row of the ledger" once the ledger exists, since the ledger will
     * deliberately hold no quiet ticks at all.
     */
    await schedulerHeartbeatRepo.record(tick);
  }

  return { record };
}
