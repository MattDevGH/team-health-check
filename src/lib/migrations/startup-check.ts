/**
 * Refuses to serve when the deployment is ahead of its database.
 *
 * Requirements: Deployment 3.8, 3.9
 *
 * Applying migrations to production is deliberate and not a side effect of a
 * deploy (Deployment 3.5). That leaves a window, and on 2026-09-27 the window
 * was two days wide: every scheduler tick asked for a column production did
 * not have, returned 500 from the first attempt, and cron-job.org eventually
 * cancelled the trigger. The application served requests throughout.
 *
 * **Refuses only on a definite answer.** A missing migration is permanent and
 * deterministic, and worth stopping for. A database that cannot be reached for
 * a moment is neither — refusing on that would turn a network blip into an
 * outage, and a guard that fails more often than the fault it prevents is not
 * worth having. So a ledger that cannot be read lets the process start, and
 * the ordinary queries surface the problem as they always did.
 *
 * Runs once per server instance, from `instrumentation.register`, so the cost
 * is one extra query on a cold start — and the connection it opens is the one
 * the first real query would have had to open anyway.
 */

import { COMMITTED_MIGRATIONS } from '@/lib/migrations/manifest';
import { LEDGER_TABLE } from '@/lib/migrations/ledger';
import { findPendingMigrations, describePendingMigrations } from '@/lib/migrations/pending';

/** Just enough of a libSQL client to read the ledger. */
export interface LedgerReader {
  execute(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface MigrationCheckDeps {
  /** Absent when the process has no production database to check. */
  openLedger?: () => LedgerReader;
  committed?: readonly string[];
  log?: (message: string) => void;
}

/**
 * Throws when the database is definitely behind the committed migrations.
 *
 * Returns quietly when it is up to date, when there is nothing to check, or
 * when the ledger could not be read.
 */
export async function assertMigrationsApplied(deps: MigrationCheckDeps = {}): Promise<void> {
  const { openLedger, committed = COMMITTED_MIGRATIONS, log = console.error } = deps;

  if (!openLedger) return;

  let applied: string[];
  try {
    const result = await openLedger().execute(`SELECT name FROM ${LEDGER_TABLE}`);
    applied = result.rows.map(row => String(row.name));
  } catch (error: unknown) {
    /*
     * Requirement 3.9 — inconclusive is not the same as behind.
     *
     * A database that has never been migrated has no ledger table either, and
     * that reads as an error here rather than as an empty list. Refusing on it
     * would stop a first deploy from ever starting, which is the one case
     * where the operator is already at the keyboard.
     */
    const message = error instanceof Error ? error.message : String(error);
    log(
      `Could not read the migration ledger, so the schema was not checked: ${message}. ` +
        'Starting anyway — a database that cannot be reached is not the same as one that ' +
        'is behind.',
    );
    return;
  }

  const pending = findPendingMigrations(committed, applied);
  if (pending.length === 0) return;

  throw new Error(describePendingMigrations(pending));
}
