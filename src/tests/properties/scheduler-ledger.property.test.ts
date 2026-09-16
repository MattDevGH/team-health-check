/**
 * **Validates: Remembering What Happened 4.1, 4.2, 4.3**
 *
 * Property 6: nothing personal is in the ledger.
 *
 * The heartbeat is replaced every few minutes and the logs last an hour; this
 * table is the one thing here that keeps anything. So the rule the recorder
 * already enforces is restated against it, generated rather than exampled,
 * because the claim is about every row the system can produce and an example
 * test checks the row somebody thought of.
 *
 * Member ids are excluded by a stricter rule than the rest: not "must not leak"
 * but "must not be there at all", which is what keeps the ledger outside a
 * member's right to have their data deleted.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories } from '@/lib/repositories';
import { createTickRecordService } from '@/lib/services/tick-record.service';

/** Anything a tick could plausibly report, including nonsense. */
/*
 * `ranAt` is left free to be an invalid Date, deliberately.
 *
 * `fc.date()` produces one roughly once in a hundred, and that is how this
 * found a real fault: an invalid time gives a NaN cutoff, every comparison
 * against NaN is false, and the prune deleted the row the test had just
 * written. Constraining the generator would have hidden it.
 *
 * Fifty runs passed locally and CI's seed found it, which is the argument for
 * the higher run count below rather than for a tamer arbitrary.
 */
const tickArb = fc.record({
  tickId: fc.string({ minLength: 1, maxLength: 12 }),
  ranAt: fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01') }),
  summary: fc.string({ maxLength: 200 }),
  opened: fc.nat({ max: 5 }),
  closed: fc.nat({ max: 5 }),
  materialised: fc.nat({ max: 5 }),
  prompts: fc.nat({ max: 20 }),
  failures: fc.nat({ max: 5 }),
  durationMs: fc.nat({ max: 60_000 }),
  reasons: fc.dictionary(fc.string({ maxLength: 40 }), fc.nat({ max: 20 }), { maxKeys: 5 }),
});

/** The shape of a row, whatever the values in it. */
const FIELDS = [
  'tickId',
  'ranAt',
  'summary',
  'opened',
  'closed',
  'materialised',
  'prompts',
  'failures',
  'durationMs',
  'reasons',
];

describe('Property 6: nothing personal reaches the ledger', () => {
  it('writes only the fields the record is defined to carry', async () => {
    /*
     * An allowlist over the row rather than a search for forbidden words.
     *
     * A "does it contain an email address" test passes for every input nobody
     * thought to generate; this one fails the moment a field is added, which is
     * the point at which somebody should be deciding whether it belongs.
     */
    await fc.assert(
      fc.asyncProperty(tickArb, async tick => {
        const repos = createInMemoryRepositories();
        const service = createTickRecordService({
          schedulerHeartbeatRepo: repos.schedulerHeartbeat,
          schedulerTickRecordRepo: repos.schedulerTickRecord,
        });

        await service.record({ ...tick, opened: tick.opened + 1 });

        const [kept] = await repos.schedulerTickRecord.recent(1);
        expect(Object.keys(kept).sort()).toEqual([...FIELDS].sort());
      }),
      { numRuns: 200 },
    );
  });

  it('never carries a member id, whatever the tick was handed', async () => {
    /*
     * Requirement 4.3, which is a restriction rather than an observation: the
     * ledger is kept free of member ids so that deletion, export and every
     * future retention question can ignore it entirely.
     *
     * The tick is handed a member id under a plausible name and the row is
     * searched for it, so this fails if anybody widens the record to pass one
     * through.
     */
    await fc.assert(
      fc.asyncProperty(tickArb, fc.uuid(), async (tick, memberId) => {
        const repos = createInMemoryRepositories();
        const service = createTickRecordService({
          schedulerHeartbeatRepo: repos.schedulerHeartbeat,
          schedulerTickRecordRepo: repos.schedulerTickRecord,
        });

        await service.record({
          ...tick,
          opened: tick.opened + 1,
          ...({ memberId, email: `${memberId}@example.invalid` } as Record<string, unknown>),
        });

        const [kept] = await repos.schedulerTickRecord.recent(1);
        expect(JSON.stringify(kept)).not.toContain(memberId);
      }),
      { numRuns: 200 },
    );
  });
});
