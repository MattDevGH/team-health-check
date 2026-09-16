/**
 * Recording cannot break the thing it records.
 *
 * Requirements: Remembering What Happened 1.4, NFR 2.1, NFR 2.2
 * Properties: 4 (recording never changes what the tick did)
 *
 * The recorder already follows this rule, and swallows silently, because a
 * failed log line has nowhere to complain to. This has a bigger failure
 * surface — a database write fails in ways `JSON.stringify` to stdout cannot —
 * and it has somewhere to complain to, which is the recorder.
 *
 * The trade is not close. A scheduler that stops opening checks because it
 * could not write down that it was opening checks is strictly worse than one
 * that forgets it did.
 */

import { describe, expect, it } from 'vitest';

import { createRecorder } from '@/lib/observability';
import { createTickRecordService } from '@/lib/services/tick-record.service';
import type { SchedulerHeartbeat, SchedulerTickRecord } from '@/lib/repositories/entities';
import type {
  SchedulerHeartbeatRepository,
  SchedulerTickRecordRepository,
} from '@/lib/repositories/types';

/** A quiet tick: the normal case, and the one the ledger does not keep. */
const TICK = {
  tickId: 'tick-1',
  ranAt: new Date('2026-09-16T09:00:00.000Z'),
  summary: 'Ran with no teams to check.',
  opened: 0,
  closed: 0,
  materialised: 0,
  prompts: 0,
  failures: 0,
  durationMs: 12,
  reasons: {},
};

/** Collects what reached the ledger, so a test can assert on it. */
function ledger() {
  const kept: SchedulerTickRecord[] = [];
  const repo: SchedulerTickRecordRepository = {
    append: async record => {
      kept.push(record);
    },
    recent: async () => kept,
    pruneBefore: async () => 0,
  };
  return { kept, repo };
}

function harness(repo: SchedulerHeartbeatRepository, tickRecordRepo = ledger().repo) {
  const events: Record<string, unknown>[] = [];
  const recorder = createRecorder({
    sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
  });

  return {
    events,
    service: createTickRecordService({
      schedulerHeartbeatRepo: repo,
      schedulerTickRecordRepo: tickRecordRepo,
      recorder,
    }),
  };
}

const working: SchedulerHeartbeatRepository = {
  record: async () => {},
  latest: async () => null,
};

const broken: SchedulerHeartbeatRepository = {
  record: async () => {
    throw new Error('database is read-only');
  },
  latest: async () => null,
};

describe('a heartbeat that could not be written', () => {
  it('does not fail the tick', async () => {
    /*
     * The observable outcome, not the absence of a throw somewhere. The route
     * awaits this before returning its response, so a rejection here would
     * turn a tick that opened a check into a 500 — and the cron service would
     * report a failure for work that succeeded.
     */
    const { service } = harness(broken);

    await expect(service.record(TICK)).resolves.toBeUndefined();
  });

  it('says so, rather than failing silently', async () => {
    // Unlike the recorder, this has somewhere to complain to
    const { service, events } = harness(broken);

    await service.record(TICK);

    expect(events[0]).toMatchObject({ event: 'tick.record.failed', level: 'error' });
  });

  it('says which tick, and why', async () => {
    // A record of a failed record that cannot be attributed is a line nobody
    // can act on, which is the defect this whole milestone exists to remove
    const { service, events } = harness(broken);

    await service.record(TICK);

    expect(events[0]).toMatchObject({ tickId: 'tick-1' });
    expect(events[0].message).toContain('read-only');
  });

  it('carries no answer content into the failure record either', async () => {
    const { service, events } = harness(broken);

    await service.record({ ...TICK, summary: 'Ran and opened 1 check.' });

    expect(JSON.stringify(events[0])).not.toMatch(/score|trend|improving|declining/i);
  });
});

describe('a heartbeat that was written', () => {
  it('says nothing, because success is the normal case', async () => {
    // A line per tick would be three hundred a day saying the expected thing,
    // which is how a log stops being read
    const { service, events } = harness(working);

    await service.record(TICK);

    expect(events).toHaveLength(0);
  });
});

describe('what reaches the ledger', () => {
  it('nothing, when the tick was a quiet one', async () => {
    /*
     * The heartbeat has already said the scheduler ran, so a quiet tick has
     * nothing left to add — and writing it is exactly what leaves a record
     * holding fifty "nothing was due" entries and no trace of the morning a
     * check opened.
     */
    const { kept, repo } = ledger();
    const { service } = harness(working, repo);

    await service.record(TICK);

    expect(kept).toEqual([]);
  });

  it('the tick, when it did something', async () => {
    const { kept, repo } = ledger();
    const { service } = harness(working, repo);

    await service.record({ ...TICK, opened: 1, summary: 'Ran and opened 1 check.' });

    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ tickId: 'tick-1', opened: 1 });
  });

  it('the tick, when it only failed', async () => {
    // Every count zero, and the most interesting tick the scheduler can have
    const { kept, repo } = ledger();
    const { service } = harness(working, repo);

    await service.record({ ...TICK, failures: 1 });

    expect(kept).toHaveLength(1);
  });

  it('nothing, when the heartbeat write already failed', async () => {
    /*
     * The heartbeat is written first, so a database that refuses writes fails
     * there and never reaches here. Asserted so that a later reordering has to
     * decide deliberately rather than by accident.
     */
    const { kept, repo } = ledger();
    const { service } = harness(broken, repo);

    await service.record({ ...TICK, opened: 1 });

    expect(kept).toEqual([]);
  });
});

describe('a service given no recorder', () => {
  it('still works, and still does not fail the tick', async () => {
    // The dependency is optional for the same reason the scheduler's is: tests
    // and scripts should not have to wire a recorder to do nothing with
    const quiet = createTickRecordService({
      schedulerHeartbeatRepo: broken,
      schedulerTickRecordRepo: ledger().repo,
    });

    await expect(quiet.record(TICK)).resolves.toBeUndefined();
  });
});

describe('what the heartbeat repository is handed', () => {
  it('is the heartbeat’s own fields, not the whole tick', async () => {
    /*
     * This asserted `toEqual([TICK])` and was asserting a defect.
     *
     * `TickRecord` is wider than `SchedulerHeartbeat`: it carries `failures`
     * and `reasons`, which that table has no columns for. Passing the whole
     * tick compiled — excess property checking only fires on literals — and
     * Prisma would have rejected every heartbeat in production with an unknown
     * argument, silently, since the service catches its own write failures.
     *
     * So the contract is the narrow one, and it is asserted as an exact set of
     * keys rather than a subset: `toMatchObject` would pass with the extra
     * fields still there.
     */
    const written: SchedulerHeartbeat[] = [];
    const { service } = harness({
      record: async beat => {
        written.push(beat);
      },
      latest: async () => null,
    });

    await service.record({ ...TICK, failures: 2, reasons: { 'team archived': 1 } });

    expect(Object.keys(written[0]).sort()).toEqual([
      'closed',
      'durationMs',
      'materialised',
      'opened',
      'prompts',
      'ranAt',
      'summary',
      'tickId',
    ]);
    expect(written[0]).toMatchObject({ tickId: 'tick-1', durationMs: 12 });
  });
});

describe('the ledger stops growing on its own', () => {
  /*
   * Requirements: Remembering What Happened 3.1, 3.2, 3.3, 3.4
   * Property: 5 (the ledger is bounded)
   *
   * The alternative to somebody else's eviction policy is having one, not
   * having none. Ninety days, because the question this exists to answer —
   * "why did no check open on Monday?" — is asked days later, and because a
   * quarter is the shortest span over which a weekly cadence has a shape.
   *
   * Pruning rides along with the tick so that nothing has to be scheduled of
   * its own. On a weekly cadence it deletes nothing on almost every tick.
   */

  function pruningLedger() {
    const cutoffs: Date[] = [];
    const repo: SchedulerTickRecordRepository = {
      append: async () => {},
      recent: async () => [],
      pruneBefore: async cutoff => {
        cutoffs.push(cutoff);
        return 0;
      },
    };
    return { cutoffs, repo };
  }

  it('prunes on every tick, including a quiet one', async () => {
    // A quiet tick writes no row and is still a chance to tidy up, which is
    // what makes a scheduled job unnecessary
    const { cutoffs, repo } = pruningLedger();
    const { service } = harness(working, repo);

    await service.record(TICK);

    expect(cutoffs).toHaveLength(1);
  });

  it('keeps ninety days, measured from when the tick ran', async () => {
    /*
     * From the tick's own clock, not the process's. The route already passes a
     * fixed time in tests and production passes one time for the whole tick;
     * two different notions of "now" inside one tick would be a bug waiting.
     */
    const { cutoffs, repo } = pruningLedger();
    const { service } = harness(working, repo);

    await service.record({ ...TICK, ranAt: new Date('2026-09-16T09:00:00.000Z') });

    expect(cutoffs[0].toISOString()).toBe('2026-06-18T09:00:00.000Z');
  });

  it('does not fail the tick when pruning throws', async () => {
    // Same trade as everywhere else here: forgetting to tidy up is better than
    // not opening a check
    const { service } = harness(working, {
      append: async () => {},
      recent: async () => [],
      pruneBefore: async () => {
        throw new Error('delete refused');
      },
    });

    await expect(service.record(TICK)).resolves.toBeUndefined();
  });

  it('still writes the ledger entry when pruning throws', async () => {
    /*
     * Order matters, and this pins it. Pruning first and failing would lose the
     * row the tick came to write — the housekeeping must never cost the record.
     */
    const kept: SchedulerTickRecord[] = [];
    const { service } = harness(working, {
      append: async record => {
        kept.push(record);
      },
      recent: async () => kept,
      pruneBefore: async () => {
        throw new Error('delete refused');
      },
    });

    await service.record({ ...TICK, opened: 1 });

    expect(kept).toHaveLength(1);
  });

  it('says so when pruning fails, rather than quietly stopping', async () => {
    // A prune that has silently failed for months is a table nobody knows is
    // growing, which is the shape of problem this milestone exists to remove
    const { service, events } = harness(working, {
      append: async () => {},
      recent: async () => [],
      pruneBefore: async () => {
        throw new Error('delete refused');
      },
    });

    await service.record(TICK);

    expect(events[0]).toMatchObject({ event: 'tick.prune.failed', level: 'error' });
  });
});
