/**
 * The ledger stops growing on its own.
 *
 * Requirements: Remembering What Happened 3.1, 3.2, 3.3, NFR 1.2
 * Properties: 5 (the ledger is bounded)
 *
 * Two things only a real database can answer: that the cutoff behaves as a
 * range rather than as an equality, and that the delete goes through the index
 * on `ranAt` rather than reading the table. A fake filters an array either way.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaSchedulerTickRecordRepository } from '@/lib/repositories/prisma/scheduler-tick-record.repository';
import { createCountedDatabase, type CountedDatabase } from './support/counted-database';

let db: CountedDatabase;
let repository: PrismaSchedulerTickRecordRepository;

const CUTOFF = new Date('2026-09-16T00:00:00.000Z');

function entry(tickId: string, ranAt: Date) {
  return {
    tickId,
    ranAt,
    summary: 'Ran and opened 1 check.',
    opened: 1,
    closed: 0,
    materialised: 0,
    prompts: 0,
    failures: 0,
    durationMs: 20,
    reasons: {},
  };
}

beforeAll(async () => {
  db = await createCountedDatabase();
  repository = new PrismaSchedulerTickRecordRepository(db.prisma);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.prisma.schedulerTickRecord.deleteMany();
});

describe('pruning the ledger', () => {
  it('removes an entry older than the cutoff', async () => {
    await repository.append(entry('ancient', new Date('2026-05-01T09:00:00.000Z')));

    await repository.pruneBefore(CUTOFF);

    expect(await db.prisma.schedulerTickRecord.count()).toBe(0);
  });

  it('keeps one inside it', async () => {
    await repository.append(entry('recent', new Date('2026-09-15T09:00:00.000Z')));
    await repository.append(entry('ancient', new Date('2026-05-01T09:00:00.000Z')));

    await repository.pruneBefore(new Date('2026-09-01T00:00:00.000Z'));

    expect((await repository.recent(10)).map(row => row.tickId)).toEqual(['recent']);
  });

  it('keeps an entry exactly on the cutoff', async () => {
    // A boundary somebody will read as inclusive one day; it is asserted so
    // that changing it has to be deliberate
    await repository.append(entry('on-the-line', CUTOFF));

    await repository.pruneBefore(CUTOFF);

    expect(await db.prisma.schedulerTickRecord.count()).toBe(1);
  });

  it('reports how many it removed', async () => {
    await repository.append(entry('old-1', new Date('2026-05-01T09:00:00.000Z')));
    await repository.append(entry('old-2', new Date('2026-05-02T09:00:00.000Z')));
    // After the cutoff, not merely recent — 15 September is before 16 September
    await repository.append(entry('kept', new Date('2026-09-20T09:00:00.000Z')));

    await expect(repository.pruneBefore(CUTOFF)).resolves.toBe(2);
  });

  it('is harmless when there is nothing to remove', async () => {
    // What happens on almost every tick, for ever, on a weekly cadence
    await repository.append(entry('recent', new Date('2026-09-20T09:00:00.000Z')));

    await expect(repository.pruneBefore(CUTOFF)).resolves.toBe(0);
    expect(await db.prisma.schedulerTickRecord.count()).toBe(1);
  });

  it('costs one statement however much it deletes', async () => {
    /*
     * NFR 1.2. A prune that read the table to decide what to delete would get
     * slower every week nobody looked at it — and it runs on every tick, so
     * the cost is paid three hundred times a day for ever.
     *
     * Counted rather than reasoned about: `deleteMany` with a range is one
     * statement, and this is the only instrument that can say so.
     */
    for (let i = 0; i < 20; i += 1) {
      await repository.append(entry(`bulk-${i}`, new Date(2026, 4, 1 + i)));
    }

    const statements = await db.countQueries(() => repository.pruneBefore(CUTOFF));

    expect(statements).toBe(1);
  });
});
