/**
 * Configuration that must be right before the server accepts a request.
 *
 * Requirements: Deployment 2.1, 2.3; Slack Sign In 5.1, 5.2, 5.3, NFR 1.4
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
  TEST_MODE?: string;
  E2E_LOCAL_RUN?: string;
  RESEND_API_KEY?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
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
   * The end-to-end suite is not a deployment, and `NODE_ENV` cannot tell them
   * apart: `next start` sets it to production locally too, and the suite runs
   * the production build on purpose so that CI and a laptop exercise the same
   * artifact. It also needs TEST_MODE, which is the entire point of the token
   * capture that replaced a scenario the suite used to skip.
   *
   * So the run marks itself, in `playwright.config.ts` and nowhere else.
   *
   * This is an opt-out on a security control, which deserves justifying. It
   * fails **closed**: absent the marker every production process is checked,
   * including on a host that sets none of the variables we might otherwise
   * have keyed on. Detecting the deployment instead — `VERCEL_ENV`, say —
   * fails open the moment the host changes or the variable is missing, which
   * is the worse direction for a guard whose job is to prevent an
   * authentication bypass. Switching TEST_MODE on in production now takes two
   * deliberate mistakes rather than one.
   */
  if (env.E2E_LOCAL_RUN === 'true') return;

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


  /**
   * `/api/test/magic-link` returns a live magic-link token when TEST_MODE is
   * enabled — a complete authentication bypass for anyone who can reach it.
   *
   * Broader than the route’s own predicate, deliberately. The route enables on
   * exactly "true", so `TEST_MODE=1` would be harmless; but it is still someone
   * trying to switch this on in production, and a deployment that survives the
   * attempt teaches the wrong lesson about whether the switch exists here. An
   * empty value is treated as absent, because platforms materialise unset
   * variables that way.
   */
  if (env.TEST_MODE) {
    throw new Error(
      `TEST_MODE is set to "${env.TEST_MODE}" in production. It exposes live sign-in ` +
        'tokens through /api/test/magic-link, which is an authentication bypass for ' +
        'anyone who can reach the URL. Remove TEST_MODE from the production ' +
        'environment entirely; it exists for the end-to-end suite.',
    );
  }
  /**
   * Requirements: Slack Sign In 5.1, 5.2, 5.3
   *
   * There are two ways into this application, and either alone is enough:
   * a magic link by email, or a sign-in link from Slack. With neither, every
   * route still answers and the sign-in page still renders — it simply cannot
   * deliver anything, and somebody trying to use it sees "check your email"
   * and waits for ever.
   *
   * That silence is the exact failure this spec was written to remove, so it
   * is caught here rather than by the first person to try signing in. Empty
   * counts as absent: a variable set to nothing is the shape a misconfigured
   * deployment actually takes.
   */
  if (!env.RESEND_API_KEY && !env.SLACK_BOT_TOKEN) {
    throw new Error(
      'Neither RESEND_API_KEY nor SLACK_BOT_TOKEN is set, so nobody could sign in: ' +
        'the application would accept an address, say "check your email", and send ' +
        'nothing. Set RESEND_API_KEY to sign in by email, or SLACK_BOT_TOKEN to sign ' +
        'in from Slack. Either alone is enough.',
    );
  }

  /**
   * Requirement: Slack Sign In NFR 1.4
   *
   * A deployment that can post to Slack but cannot verify what comes back is
   * the configuration that made the fail-open invisible: outbound worked, so
   * nothing looked wrong, while every inbound route accepted a signature
   * computed from an empty key — which is to say, from no secret at all.
   *
   * `verifySlackSignature` refuses that case now, so the routes fail closed
   * rather than open. This exists so the deployment fails *first*, at startup,
   * rather than at the first member who tries to answer from Slack and is
   * refused without explanation.
   *
   * Conditioned on the bot token, not required outright: Requirement 5.2 says
   * a deployment with no Slack app is legitimate, and a guard that made an
   * email-only deployment set a Slack variable would break a working
   * arrangement to fix one that is not in use.
   */
  if (env.SLACK_BOT_TOKEN && !env.SLACK_SIGNING_SECRET) {
    throw new Error(
      'SLACK_BOT_TOKEN is set but SLACK_SIGNING_SECRET is not, so this deployment ' +
        'can post to Slack and cannot verify what comes back. Every inbound Slack ' +
        'route would refuse its traffic: slash commands, interactions and events ' +
        'would all fail for members who have no other way in. Set ' +
        'SLACK_SIGNING_SECRET from the Slack app, under Basic Information → App ' +
        'Credentials, or remove SLACK_BOT_TOKEN to run on email alone.',
    );
  }
}
