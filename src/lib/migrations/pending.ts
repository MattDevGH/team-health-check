/**
 * Which committed migrations a database has not recorded.
 *
 * Requirements: Deployment 3.8, 3.9
 *
 * Applying migrations to production is a deliberate step and not a side effect
 * of a deploy (Deployment 3.5). That is the right design and it leaves a
 * window: between the deploy and the migration, running code expects columns
 * the database does not have.
 *
 * On 2026-09-27 that window was two days wide. Every scheduler tick asked for
 * `SlackInteractionQueue.idempotencyKey`, production did not have it, and the
 * tick returned 500 from the first attempt until cron-job.org cancelled the
 * trigger. The application served requests happily throughout, against a
 * schema it did not match.
 *
 * Pure, and separate from anything that opens a connection, so the rule can be
 * exercised without one.
 */

/**
 * Committed migrations the ledger has no record of, in committed order.
 *
 * Compares the whole list rather than the newest name. Migrations are applied
 * in order and recorded one at a time, so a partial run leaves a prefix — but
 * a branch merged late can introduce a name that sorts *before* one already
 * applied, and only comparing the set notices that.
 */
export function findPendingMigrations(
  committed: readonly string[],
  applied: readonly string[],
): string[] {
  const recorded = new Set(applied);
  return committed.filter(name => !recorded.has(name));
}

/**
 * The message a deployment refusing to start prints.
 *
 * Names the migrations and the command, because the person reading it is
 * looking at a failed deploy and should not have to go and find either.
 */
export function describePendingMigrations(pending: readonly string[]): string {
  return (
    `${pending.length} migration(s) are committed but not applied to this database:\n` +
    pending.map(name => `  ${name}`).join('\n') +
    '\n\nThe deployed code expects columns the database does not have, so queries ' +
    'touching them\nwould fail wherever a user or the scheduler happened to be. ' +
    'Apply them with:\n\n  npx tsx scripts/migrate-production.ts\n\n' +
    'then verify by reading the schema back:\n\n  npx tsx scripts/verify-production.ts'
  );
}
