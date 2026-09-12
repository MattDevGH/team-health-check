// @vitest-environment node

/**
 * Applying the committed migrations to a libSQL database.
 *
 * Requirements: Deployment 3.3, 3.4
 * Properties: 3, 4
 *
 * `prisma migrate deploy` cannot target Turso, so production needs its own path.
 * The mechanism is the one already proven in `libsql-repository.test.ts` —
 * `@libsql/client` with `executeMultiple` over each `migration.sql` — plus the
 * two things a production run needs and a throwaway test database does not: a
 * record of what has been applied, and the discipline to skip it next time.
 *
 * Exercised against a real temporary file. `@libsql/client` accepts a local
 * `file:` URL, so the production code path runs with no Turso account, which is
 * the difference between testing this mechanism and testing a stand-in for it.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient, type Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, LEDGER_TABLE } from '@/lib/migrations/apply-migrations';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

let workDir: string;
let client: Client;

/** Every table the database currently holds, ledger excluded. */
async function tableNames(db: Client): Promise<string[]> {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows
    .map(row => String(row.name))
    .filter(name => name !== LEDGER_TABLE);
}

async function ledgerEntries(db: Client): Promise<string[]> {
  const result = await db.execute(`SELECT name FROM ${LEDGER_TABLE} ORDER BY name`);
  return result.rows.map(row => String(row.name));
}

describe('applyMigrations', () => {
  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-migrate-'));
    const file = path.join(workDir, 'target.db').replace(/\\/g, '/');
    client = createClient({ url: `file:${file}` });
  });

  afterEach(() => {
    client?.close();
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can hold the file briefly; a leftover temp dir must not fail a run
    }
  });

  it('creates the schema on an empty database', async () => {
    await applyMigrations(client);

    const tables = await tableNames(client);
    expect(tables).toContain('Team');
    expect(tables).toContain('HealthCheckSession');
    expect(tables).toContain('Response');
    expect(tables).toContain('NotificationDelivery');
  });

  it('reports which migrations it applied', async () => {
    // A script that prints nothing leaves the operator inferring success from an
    // exit code, which is the habit this whole milestone exists to break
    const result = await applyMigrations(client);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.skipped).toEqual([]);
  });

  it('applies migrations in lexicographic order', async () => {
    // Prisma names directories by timestamp, so lexicographic *is* chronological.
    // Applied out of order, a later migration would alter a table that does not
    // exist yet.
    const result = await applyMigrations(client);

    expect(result.applied).toEqual([...result.applied].sort());
  });

  it('applies nothing the second time', async () => {
    const first = await applyMigrations(client);
    const second = await applyMigrations(client);

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.applied);
  });

  it('leaves the schema identical after a second run', async () => {
    // The property that makes the script safe to re-run against production.
    // Re-applying `CREATE TABLE` would throw; re-applying a table redefinition
    // could silently drop data.
    await applyMigrations(client);
    const before = await tableNames(client);

    await applyMigrations(client);

    expect(await tableNames(client)).toEqual(before);
  });

  it('preserves data across a second run', async () => {
    // The failure worth fearing is not an error — it is a re-run that succeeds
    // and quietly empties a table
    await applyMigrations(client);
    await client.execute(
      "INSERT INTO Team (id, name, privacyMode, archived, timezone, createdAt, updatedAt) " +
        "VALUES ('t1', 'Survivors', 'anonymous', 0, 'Europe/London', '2026-09-12', '2026-09-12')",
    );

    await applyMigrations(client);

    const rows = await client.execute("SELECT name FROM Team WHERE id = 't1'");
    expect(rows.rows).toHaveLength(1);
    expect(String(rows.rows[0].name)).toBe('Survivors');
  });

  it('resumes a partially applied set', async () => {
    // A genuine partial run: the first migration executed and was recorded,
    // the rest never ran. Built by hand rather than by deleting a ledger row,
    // which would describe a different state — see the test below.
    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    await client.executeMultiple(
      readFileSync(path.join(MIGRATIONS_DIR, names[0], 'migration.sql'), 'utf8'),
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (name TEXT NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`,
    );
    await client.execute(`INSERT INTO ${LEDGER_TABLE} (name, applied_at) VALUES (?, ?)`, [
      names[0],
      '2026-09-12T00:00:00.000Z',
    ]);

    const resumed = await applyMigrations(client);

    expect(resumed.skipped).toEqual([names[0]]);
    expect(resumed.applied).toEqual(names.slice(1));
  });

  it('fails loudly if a migration ran but was never recorded', async () => {
    /*
     * The one interruption this cannot recover from: a crash between executing
     * a migration and writing its ledger row. The next run tries to re-apply
     * it and SQLite refuses, because the table already exists.
     *
     * That is the right behaviour and the reason the ledger is written *after*
     * the migration rather than before. Recording first would make a crash
     * leave a migration marked done that never ran — silently skipped forever,
     * and discovered as a missing column in production. Failing loudly costs a
     * manual ledger insert; failing quietly costs a schema nobody can trust.
     */
    const full = await applyMigrations(client);
    await client.execute(`DELETE FROM ${LEDGER_TABLE} WHERE name = ?`, [
      full.applied[full.applied.length - 1],
    ]);

    await expect(applyMigrations(client)).rejects.toThrow(/already exists/i);
  });

  it('records every applied migration in the ledger', async () => {
    const result = await applyMigrations(client);

    expect(await ledgerEntries(client)).toEqual([...result.applied].sort());
  });

  it('creates its ledger without being asked twice', async () => {
    // The first production run meets a database with no ledger table at all
    await expect(applyMigrations(client)).resolves.toBeDefined();
    await expect(applyMigrations(client)).resolves.toBeDefined();
  });
});
