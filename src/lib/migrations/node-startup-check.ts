/**
 * The migration guard, wired to a real Turso connection.
 *
 * Requirements: Deployment 3.8, 3.9
 *
 * Separate from `startup-check.ts`, which is the rule and takes its
 * dependencies, and separate from `instrumentation.ts`, which Next.js builds
 * for **every** runtime including Edge. `@libsql/client` cannot be bundled for
 * Edge — it fails the build with "Unknown module type" — so the only safe
 * place to name it is a module imported behind
 * `process.env.NEXT_RUNTIME === 'nodejs'`, which is the pattern Next's own
 * instrumentation guide gives.
 */

import { createClient } from '@libsql/client';

import { assertMigrationsApplied, type LedgerReader } from '@/lib/migrations/startup-check';

/**
 * A connection to the production database, or nothing when there is no
 * production database to check.
 *
 * Only Turso. A local SQLite file is migrated by whoever is sitting in front
 * of it, and the end-to-end suite provisions its own database from the same
 * migrations moments earlier — checking either would be asking a question
 * whose answer is already known.
 */
function openProductionLedger(): (() => LedgerReader) | undefined {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || process.env.E2E_LOCAL_RUN === 'true') return undefined;

  return () => createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

/**
 * Throws when this deployment is ahead of its database.
 *
 * The connection opened here is the one the first real query would have had
 * to open anyway, so the cost on a cold start is a round trip rather than a
 * connection.
 */
export async function checkMigrations(): Promise<void> {
  await assertMigrationsApplied({ openLedger: openProductionLedger() });
}
