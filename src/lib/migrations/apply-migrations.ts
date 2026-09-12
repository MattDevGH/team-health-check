/**
 * Applies the committed Prisma migrations to a libSQL database.
 *
 * Requirements: Deployment 3.3, 3.4
 * Properties: 3, 4
 *
 * `prisma migrate deploy` cannot target Turso — its datasource takes a plain url
 * and this schema's provider is `sqlite` — and `prisma.config.ts` now refuses
 * rather than quietly migrating a local file. This is the path it names.
 *
 * The mechanism is the one already proven in
 * `src/tests/integration/libsql-repository.test.ts`: read each `migration.sql`
 * and hand it to `executeMultiple`. What a production run adds is a record of
 * what has been applied and the discipline to skip it next time, because a
 * second run must not re-execute `CREATE TABLE` or, worse, re-run a table
 * redefinition that silently empties something.
 *
 * Takes a client rather than building one, so the tests exercise this exact code
 * against a local `file:` database with no Turso account.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Client } from '@libsql/client';

/**
 * Where the ledger lives.
 *
 * Deliberately not Prisma's `_prisma_migrations`. That table carries a checksum
 * whose derivation we would be guessing at, and a mismatched checksum makes
 * Prisma tooling refuse to proceed — a self-inflicted wound for a table no
 * Prisma command can ever read here, since the CLI cannot connect to Turso at
 * all. A small table that says exactly what it knows is the honest choice.
 *
 * The cost, recorded rather than hidden: if this database is ever moved
 * somewhere Prisma *can* migrate, this history has to be reconciled by hand.
 */
export const LEDGER_TABLE = '_applied_migration';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

export interface MigrationOutcome {
  /** Migrations executed by this run, in the order they were applied. */
  applied: string[];
  /** Migrations already recorded, left alone. */
  skipped: string[];
}

/**
 * Migration directory names, in the order they must be applied.
 *
 * Prisma names directories by timestamp, so lexicographic order is
 * chronological order. Applied out of sequence, a later migration would alter a
 * table that does not exist yet.
 */
function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => existsSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')))
    .sort();
}

/** Creates the ledger if this is the first run against a database. */
async function ensureLedger(client: Client): Promise<void> {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       name TEXT NOT NULL PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );
}

async function alreadyApplied(client: Client): Promise<Set<string>> {
  const result = await client.execute(`SELECT name FROM ${LEDGER_TABLE}`);
  return new Set(result.rows.map(row => String(row.name)));
}

/**
 * Applies every migration not yet recorded, in order.
 *
 * The ledger row is written **after** the migration, not before, and the order
 * matters. A crash between the two leaves a migration applied but unrecorded,
 * so the next run tries to re-apply it and SQLite refuses — loud, and fixable
 * with one manual ledger insert. Recording first would invert that: a crash
 * would mark a migration done that never ran, silently skipped forever and
 * discovered as a missing column in production. Loud beats quiet.
 *
 * Each migration is recorded immediately after it executes rather than at the
 * end, so an interrupted run resumes from the right place instead of starting
 * again.
 */
export async function applyMigrations(client: Client): Promise<MigrationOutcome> {
  await ensureLedger(client);

  const done = await alreadyApplied(client);
  const outcome: MigrationOutcome = { applied: [], skipped: [] };

  for (const name of migrationNames()) {
    if (done.has(name)) {
      outcome.skipped.push(name);
      continue;
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
    await client.executeMultiple(sql);
    await client.execute(`INSERT INTO ${LEDGER_TABLE} (name, applied_at) VALUES (?, ?)`, [
      name,
      new Date().toISOString(),
    ]);

    outcome.applied.push(name);
  }

  return outcome;
}
