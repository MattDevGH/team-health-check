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
import type { SchedulerHeartbeat } from '@/lib/repositories/entities';
import type { SchedulerHeartbeatRepository } from '@/lib/repositories/types';

const TICK = {
  tickId: 'tick-1',
  ranAt: new Date('2026-09-16T09:00:00.000Z'),
  summary: 'Ran with no teams to check.',
  opened: 0,
  closed: 0,
  materialised: 0,
  prompts: 0,
  durationMs: 12,
};

function harness(repo: SchedulerHeartbeatRepository) {
  const events: Record<string, unknown>[] = [];
  const recorder = createRecorder({
    sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
  });

  return { events, service: createTickRecordService({ schedulerHeartbeatRepo: repo, recorder }) };
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

describe('a service given no recorder', () => {
  it('still works, and still does not fail the tick', async () => {
    // The dependency is optional for the same reason the scheduler's is: tests
    // and scripts should not have to wire a recorder to do nothing with
    const quiet = createTickRecordService({ schedulerHeartbeatRepo: broken });

    await expect(quiet.record(TICK)).resolves.toBeUndefined();
  });
});

describe('what the repository is handed', () => {
  it('is the tick, unchanged', async () => {
    const written: SchedulerHeartbeat[] = [];
    const { service } = harness({
      record: async beat => {
        written.push(beat);
      },
      latest: async () => null,
    });

    await service.record(TICK);

    expect(written).toEqual([TICK]);
  });
});
