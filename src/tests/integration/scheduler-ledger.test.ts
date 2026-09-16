// @vitest-environment node

/**
 * The ticks worth keeping, kept.
 *
 * Requirements: Remembering What Happened 2.1, 2.4, 2.5, 4.1, 4.2, 4.3
 * Properties: 3 (eventful ticks always enter the ledger), 6 (nothing personal)
 *
 * Unlike the heartbeat, this table grows — so the things worth proving against
 * a real database are that it appends rather than replaces, that reading it
 * back newest-first is indexed rather than a sort over everything, and that the
 * reasons survive a round trip through a column that has no map type.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { PrismaSchedulerHeartbeatRepository } from '@/lib/repositories/prisma/scheduler-heartbeat.repository';
import { PrismaSchedulerTickRecordRepository } from '@/lib/repositories/prisma/scheduler-tick-record.repository';
import { createTickRecordService } from '@/lib/services/tick-record.service';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

let workDir: string;
let prisma: PrismaClient;

async function applyMigrations(client: ReturnType<typeof createClient>): Promise<number> {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  let applied = 0;
  for (const dir of dirs) {
    const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!existsSync(file)) continue;
    await client.executeMultiple(readFileSync(file, 'utf8'));
    applied += 1;
  }

  return applied;
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    tickId: 'tick-1',
    ranAt: new Date('2026-09-16T09:00:00.000Z'),
    summary: 'Ran and opened 1 check.',
    opened: 1,
    closed: 0,
    materialised: 0,
    prompts: 0,
    failures: 0,
    durationMs: 40,
    reasons: {},
    ...overrides,
  };
}

describe('the scheduler ledger over libSQL', () => {
  let appliedMigrations = 0;

  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-ledger-'));
    const dbPath = path.join(workDir, 'ledger-test.db').replace(/\\/g, '/');
    const url = `file:${dbPath}`;

    const client = createClient({ url });
    appliedMigrations = await applyMigrations(client);
    client.close();

    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      if (workDir) rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best effort — the OS reclaims the temp directory
    }
  });

  it('applies the committed migrations through the adapter', () => {
    expect(appliedMigrations).toBeGreaterThan(0);
  });

  it('appends rather than replacing, unlike the heartbeat', async () => {
    /*
     * The opposite policy to `SchedulerHeartbeat`, and the reason they are two
     * tables. A ledger that replaced would answer "what did it last do?" — a
     * question already answered — and never "what happened on Monday".
     */
    const repository = new PrismaSchedulerTickRecordRepository(prisma);

    await repository.append(entry({ tickId: 'ledger-a' }));
    await repository.append(entry({ tickId: 'ledger-b' }));

    expect(await prisma.schedulerTickRecord.count()).toBe(2);
  });

  it('reads back newest first, since that is how anybody looks', async () => {
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();

    await repository.append(
      entry({ tickId: 'older', ranAt: new Date('2026-09-14T09:00:00.000Z') }),
    );
    await repository.append(
      entry({ tickId: 'newer', ranAt: new Date('2026-09-15T09:00:00.000Z') }),
    );

    const recent = await repository.recent(10);

    expect(recent.map(row => row.tickId)).toEqual(['newer', 'older']);
  });

  it('reads a page rather than everything', async () => {
    // Requirement 2.5. A ledger read that loads the table is a ledger read that
    // gets slower every week it is not looked at
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();

    for (let i = 0; i < 5; i += 1) {
      await repository.append(
        entry({ tickId: `page-${i}`, ranAt: new Date(2026, 8, 16, 9, i) }),
      );
    }

    expect(await repository.recent(2)).toHaveLength(2);
  });

  it('carries the reasons through a column with no map type', async () => {
    /*
     * SQLite has no map, so the reasons cross as text. A round trip is the only
     * thing that proves the encoding and the decoding agree — asserting the
     * write alone would pass against a reader that returned an empty object.
     */
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();

    await repository.append(
      entry({
        tickId: 'with-reasons',
        reasons: { 'outside the collection window': 2, 'no schedule configured': 1 },
      }),
    );

    expect((await repository.recent(1))[0].reasons).toEqual({
      'outside the collection window': 2,
      'no schedule configured': 1,
    });
  });

  it('survives a row written before reasons were understood', async () => {
    // A column holding text can hold text that is not JSON, and a reader that
    // threw would take the whole page down over one malformed row
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();
    await repository.append(entry({ tickId: 'malformed' }));
    await prisma.schedulerTickRecord.updateMany({ data: { reasons: 'not json at all' } });

    expect((await repository.recent(1))[0].reasons).toEqual({});
  });

  it('carries the counts, including what failed', async () => {
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();

    await repository.append(
      entry({ tickId: 'counted', opened: 2, closed: 1, materialised: 3, prompts: 7, failures: 1 }),
    );

    expect((await repository.recent(1))[0]).toMatchObject({
      opened: 2,
      closed: 1,
      materialised: 3,
      prompts: 7,
      failures: 1,
    });
  });

  it('has nothing to show before the scheduler has done anything', async () => {
    const repository = new PrismaSchedulerTickRecordRepository(prisma);
    await prisma.schedulerTickRecord.deleteMany();

    await expect(repository.recent(10)).resolves.toEqual([]);
  });
});

describe('the service over the real repositories', () => {
  /*
   * Requirements: Remembering What Happened 1.1, 2.1
   *
   * The route's own tests run against in-memory fakes, and the repository
   * tests above construct their own rows. Neither exercises the production
   * path: the service handing a real `TickRecord` to a real Prisma
   * repository.
   *
   * That gap hid a defect. `TickRecord` is wider than `SchedulerHeartbeat` —
   * it carries `failures` and `reasons`, which that table has no columns for —
   * and the service spread it wholesale. TypeScript accepted it, the fakes
   * accepted it, and Prisma would have rejected every heartbeat in production
   * with an unknown argument. Construction is not execution.
   */

  function tick(overrides: Record<string, unknown> = {}) {
    return {
      tickId: 'service-tick',
      ranAt: new Date('2026-09-16T11:00:00.000Z'),
      summary: 'Ran and opened 1 check.',
      opened: 1,
      closed: 0,
      materialised: 0,
      prompts: 0,
      failures: 0,
      durationMs: 31,
      reasons: { 'no schedule configured': 2 },
      ...overrides,
    };
  }

  function service() {
    return createTickRecordService({
      schedulerHeartbeatRepo: new PrismaSchedulerHeartbeatRepository(prisma),
      schedulerTickRecordRepo: new PrismaSchedulerTickRecordRepository(prisma),
    });
  }

  it('writes a heartbeat the heartbeat table will accept', async () => {
    await prisma.schedulerHeartbeat.deleteMany();

    await service().record(tick());

    expect(
      await new PrismaSchedulerHeartbeatRepository(prisma).latest(),
      'the heartbeat should have been written, not swallowed as a failure',
    ).toMatchObject({ tickId: 'service-tick' });
  });

  it('writes an eventful tick to the ledger, reasons and all', async () => {
    await prisma.schedulerTickRecord.deleteMany();

    await service().record(tick({ tickId: 'service-eventful' }));

    const [kept] = await new PrismaSchedulerTickRecordRepository(prisma).recent(1);
    expect(kept).toMatchObject({
      tickId: 'service-eventful',
      reasons: { 'no schedule configured': 2 },
    });
  });

  it('writes nothing to the ledger for a quiet tick', async () => {
    await prisma.schedulerTickRecord.deleteMany();

    await service().record(tick({ tickId: 'service-quiet', opened: 0 }));

    expect(await prisma.schedulerTickRecord.count()).toBe(0);
    // and the heartbeat still says it ran
    expect((await new PrismaSchedulerHeartbeatRepository(prisma).latest())?.tickId).toBe(
      'service-quiet',
    );
  });
});
