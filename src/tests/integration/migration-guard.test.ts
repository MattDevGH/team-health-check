/**
 * The startup guard against a real ledger.
 *
 * Requirements: Deployment 3.8, 3.9; NFR 3.7
 *
 * The unit tests drive the rule against stubs. This drives it against an
 * actual libSQL database with an actual `_applied_migration` table, because
 * the thing that failed on 2026-09-27 was a query against a real schema, and
 * a stub cannot be behind in the way a database can.
 *
 * It also pins the shape of the ledger. The guard reads `name` from
 * `_applied_migration`; if `apply-migrations.ts` ever renamed either, the
 * stubs would keep passing while production silently stopped being checked.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';

import { assertMigrationsApplied } from '@/lib/migrations/startup-check';
import { LEDGER_TABLE } from '@/lib/migrations/apply-migrations';

const COMMITTED = ['20260620233208_init', '20260926120000_add_interaction_idempotency_key'];

let workDir = '';
let client: Client;

/** A libSQL file URL, which needs forward slashes on every platform. */
function fileUrl(filePath: string): string {
  return `file:${filePath.split(path.sep).join('/')}`;
}

async function recordApplied(...names: string[]): Promise<void> {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (name TEXT NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  for (const name of names) {
    await client.execute({
      sql: `INSERT INTO ${LEDGER_TABLE} (name, applied_at) VALUES (?, ?)`,
      args: [name, new Date().toISOString()],
    });
  }
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'thc-guard-'));
  client = createClient({ url: fileUrl(path.join(workDir, 'guard.db')) });
});

afterEach(() => {
  client.close();
  try {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows can hold the file briefly after close; a leftover temp
    // directory must not fail a run — the same allowance counted-database
    // makes for the same reason
  }
});

const openLedger = () => () => client;

it('starts against a database that has every migration', async () => {
  await recordApplied(...COMMITTED);

  await expect(
    assertMigrationsApplied({ openLedger: openLedger(), committed: COMMITTED }),
  ).resolves.toBeUndefined();
});

/**
 * Requirement 3.8, and exactly the state production was in: one migration
 * recorded, the newer one committed and deployed but never applied.
 */
it('refuses against a database that is behind, naming what is missing', async () => {
  await recordApplied('20260620233208_init');

  await expect(
    assertMigrationsApplied({ openLedger: openLedger(), committed: COMMITTED }),
  ).rejects.toThrow(/20260926120000_add_interaction_idempotency_key/);
});

/**
 * Requirement 3.9
 *
 * A database that has never been migrated has no ledger table, and reading it
 * raises "no such table" rather than returning nothing. Refusing on that would
 * stop a first deploy from ever starting.
 */
it('starts against a database with no ledger table at all', async () => {
  await expect(
    assertMigrationsApplied({ openLedger: openLedger(), committed: COMMITTED }),
  ).resolves.toBeUndefined();
});

it('reads the ledger this project actually writes', async () => {
  // Pins the table and column the guard depends on. Renaming either in
  // apply-migrations.ts would leave the stubs passing and production
  // unchecked.
  await recordApplied(...COMMITTED);

  const result = await client.execute(`SELECT name FROM ${LEDGER_TABLE}`);

  expect(result.rows.map(row => String(row.name)).sort()).toEqual([...COMMITTED].sort());
});
