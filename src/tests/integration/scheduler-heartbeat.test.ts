/**
 * A heartbeat that is replaced rather than appended.
 *
 * Requirements: Remembering What Happened 1.2, 1.5
 * Properties: 1 (a tick always leaves a heartbeat)
 *
 * The whole point of the heartbeat is that it does not grow: one row, rewritten
 * by every tick including the quiet ones, so that "is the scheduler running?"
 * costs one indexed read for ever.
 *
 * That is an upsert's behaviour, which belongs to the adapter and not to a fake.
 * An in-memory map replaces a key whatever the database would have done, so a
 * unit test here would pass against a Prisma implementation that inserted a
 * second row every tick — and the fault would surface as a table growing by
 * three hundred rows a day in production, months later.
 *
 * Run over libSQL specifically: it is the adapter production uses, and this
 * repository is written for a race it has to survive.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { PrismaSchedulerHeartbeatRepository } from '@/lib/repositories/prisma/scheduler-heartbeat.repository';

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

/** A tick's worth of facts, with only what differs supplied. */
function beat(overrides: Partial<Parameters<PrismaSchedulerHeartbeatRepository['record']>[0]> = {}) {
  return {
    tickId: 'tick-1',
    ranAt: new Date('2026-09-16T09:00:00.000Z'),
    summary: 'Ran with no teams to check.',
    opened: 0,
    closed: 0,
    materialised: 0,
    prompts: 0,
    durationMs: 12,
    ...overrides,
  };
}

describe('the scheduler heartbeat over libSQL', () => {
  let appliedMigrations = 0;

  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-heartbeat-'));
    const dbPath = path.join(workDir, 'heartbeat-test.db').replace(/\\/g, '/');
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
    // Guards against silently testing an empty schema
    expect(appliedMigrations).toBeGreaterThan(0);
  });

  it('has nothing to report before the scheduler has ever run', async () => {
    /*
     * Requirement 5.3. "Never run" is a real state with its own message — it is
     * what a fresh deployment with a misconfigured CRON_SECRET looks like — so
     * the repository has to be able to express it rather than inventing a zero.
     */
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);

    await expect(repository.latest()).resolves.toBeNull();
  });

  it('reports the tick that wrote it', async () => {
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);

    await repository.record(beat({ tickId: 'tick-first', summary: 'Ran and opened 1 check.' }));

    const latest = await repository.latest();
    expect(latest).toMatchObject({ tickId: 'tick-first', summary: 'Ran and opened 1 check.' });
  });

  it('replaces the previous beat instead of adding to it', async () => {
    /*
     * The assertion this file exists for. Counted directly against the table,
     * because "latest() returns the newest" is also true of an implementation
     * that appends for ever.
     */
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);

    await repository.record(beat({ tickId: 'tick-a' }));
    await repository.record(beat({ tickId: 'tick-b' }));
    await repository.record(beat({ tickId: 'tick-c' }));

    expect(await prisma.schedulerHeartbeat.count()).toBe(1);
    expect((await repository.latest())?.tickId).toBe('tick-c');
  });

  it('carries the time the tick ran, not the time it was written', async () => {
    // Dates cross an adapter as a type the adapter chooses; a heartbeat whose
    // time is wrong answers "has it stopped?" wrongly
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);
    const ranAt = new Date('2026-09-16T14:31:07.000Z');

    await repository.record(beat({ tickId: 'tick-timed', ranAt }));

    expect((await repository.latest())?.ranAt.toISOString()).toBe('2026-09-16T14:31:07.000Z');
  });

  it('carries the counts, so one read answers both questions', async () => {
    // Requirement 1.3 — "is it alive?" and "what did it last do?" should not be
    // two round trips
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);

    await repository.record(
      beat({ tickId: 'tick-counted', opened: 2, closed: 1, materialised: 3, prompts: 7 }),
    );

    expect(await repository.latest()).toMatchObject({
      opened: 2,
      closed: 1,
      materialised: 3,
      prompts: 7,
    });
  });

  it('survives two ticks writing at once', async () => {
    /*
     * Requirement 1.5. Nothing prevents a second cron service, a manual curl,
     * or a run overlapping the one before it. A read-then-write would leave two
     * rows or throw on the unique key; an upsert makes the race uninteresting.
     *
     * Asserted as one row holding one of the two tick ids — which of them won
     * is genuinely not the point, and pinning it would be asserting an ordering
     * the database never promised.
     */
    const repository = new PrismaSchedulerHeartbeatRepository(prisma);

    await Promise.all([
      repository.record(beat({ tickId: 'tick-race-1' })),
      repository.record(beat({ tickId: 'tick-race-2' })),
    ]);

    expect(await prisma.schedulerHeartbeat.count()).toBe(1);
    expect(['tick-race-1', 'tick-race-2']).toContain((await repository.latest())?.tickId);
  });
});
