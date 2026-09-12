/**
 * Configuration that must be right before the server accepts a request.
 *
 * Requirements: Deployment 2.1, 2.3
 *
 * These are the mistakes that would otherwise be discovered by a user rather
 * than by a deployment: a production process with nowhere durable to write.
 * Each one aborts startup, because a process that cannot keep its promises
 * should not be answering requests while it fails to keep them.
 *
 * Called from `src/instrumentation.ts`, whose `register` hook Next.js runs once
 * when a server instance starts and which must complete before the server is
 * ready. Deliberately *not* at module load: `next build` imports every route
 * with `NODE_ENV=production` to collect page data, so a module-load guard fails
 * the build rather than the deployment — which is how the first version of this
 * was written, and what the build caught.
 *
 * What this actually does, measured rather than assumed: `next start` logs
 * "Failed to prepare server", stays listening, and answers every request with
 * 500. It is not literally a refusal to bind a port. What matters is that no
 * request reaches a handler and no local database file is created — checked by
 * running a production server with the variable unset and confirming both.
 *
 * Takes the environment as an argument so the rules can be exercised directly,
 * without resetting modules or mutating the real `process.env`.
 */

/** The subset of the environment these guards read. */
export interface StartupEnvironment {
  NODE_ENV?: string;
  TURSO_DATABASE_URL?: string;
}

/**
 * Throws if the environment describes a production process that should not run.
 *
 * Non-production environments are left alone entirely: development and the test
 * suites rely on the local SQLite fallback.
 */
export function assertProductionReady(env: StartupEnvironment): void {
  if (env.NODE_ENV !== 'production') return;

  /**
   * Without a Turso URL the application opens a local SQLite file. A serverless
   * function has no persistent filesystem: the file does not exist, is not
   * shared between concurrent instances, and is destroyed on the next deploy.
   * The application would start, answer requests and lose every response — a
   * failure that reads as data vanishing rather than as a missing variable.
   */
  if (!env.TURSO_DATABASE_URL) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. In production the application would open a ' +
        'local SQLite file, which a serverless deployment cannot persist: responses ' +
        'would be lost on the next deploy and would not be shared between instances. ' +
        'Set TURSO_DATABASE_URL to the production database.',
    );
  }
}
