/**
 * Server startup hook.
 *
 * Next.js calls `register` once when a server instance is initiated, and it
 * must complete before the server is ready to handle requests — which makes it
 * the one place a misconfiguration can stop a deployment rather than surface as
 * a user's error later.
 *
 * It is not called during `next build`, which matters: the build imports every
 * route with `NODE_ENV=production` to collect page data, so the same checks at
 * module load fail the build instead of the deployment.
 *
 * Requirements: Deployment 2.3
 */

import { assertProductionReady } from '@/lib/startup-guards';
export async function register(): Promise<void> {
  assertProductionReady(process.env);

  /*
   * Requirements: Deployment 3.8, 3.9
   *
   * Refuses to serve when the database is behind the committed migrations.
   *
   * Second, and deliberately: the environment checks above are pure and
   * instant, and there is no sense opening a connection for a deployment that
   * was never going to start.
   *
   * Behind `NEXT_RUNTIME`, which is the pattern Next's instrumentation guide
   * gives: `register` is called in every runtime and `@libsql/client` cannot
   * be bundled for Edge — it fails the build outright.
   *
   * On 2026-09-27 two migrations had been merged and deployed two days
   * earlier and never applied. Every scheduler tick asked for a column
   * production did not have and returned 500 from the first attempt, until
   * cron-job.org cancelled the trigger. Nothing refused; the application
   * served requests against a schema it did not match for two days.
   */
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkMigrations } = await import('@/lib/migrations/node-startup-check');
    await checkMigrations();
  }
}
