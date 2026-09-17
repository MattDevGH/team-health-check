// @vitest-environment node

/**
 * A production process without a database must not serve requests.
 *
 * Requirements: Deployment 2.1, 2.3
 * Property: 1
 *
 * `createPrismaClient()` selects the libSQL adapter when `TURSO_DATABASE_URL` is
 * set and otherwise opens a local SQLite file. That fallback is right in
 * development and catastrophic in production: a serverless function has no
 * persistent filesystem, so the file does not exist, is not shared between
 * instances, and is destroyed on the next deploy. The application would start,
 * answer requests, and lose every response — a failure that looks like data
 * vanishing rather than like a missing environment variable.
 *
 * The check first lived in the client factory, at module load. `npm run build`
 * rejected it: `next build` imports every route with `NODE_ENV=production` to
 * collect page data, so a module-load guard fails the build rather than the
 * deployment. It now runs from the `register` hook in `src/instrumentation.ts`,
 * which Next.js calls once per server instance and which must complete before
 * the server is ready — the difference between "this deployment will not go
 * live" and "this project will not compile".
 */

import { describe, expect, it } from 'vitest';

import { assertProductionReady } from '@/lib/startup-guards';

describe('assertProductionReady', () => {
  it('refuses a production environment with no database', () => {
    expect(() => assertProductionReady({ NODE_ENV: 'production' })).toThrow();
  });

  it('names the missing variable, because the reader is staring at a failed deploy', () => {
    expect(() => assertProductionReady({ NODE_ENV: 'production' })).toThrow(
      /TURSO_DATABASE_URL/,
    );
  });

  it('says what the fallback would have cost, not merely that something is unset', () => {
    // "TURSO_DATABASE_URL is not set" leaves the reader to work out why it
    // matters. That responses would be lost on the next deploy is the point.
    expect(() => assertProductionReady({ NODE_ENV: 'production' })).toThrow(/lost/i);
  });

  it('treats a blank URL as absent, the way the client factory does', () => {
    // `createPrismaClient` branches on truthiness. If these disagreed, startup
    // would pass and the application would then open a local file.
    expect(() =>
      assertProductionReady({ NODE_ENV: 'production', TURSO_DATABASE_URL: '' }),
    ).toThrow(/TURSO_DATABASE_URL/);
  });

  it('allows a production environment that has one', () => {
    // A sign-in provider too, since production is refused without one — this
    // test is about the database URL and should not fail for another reason
    expect(() =>
      assertProductionReady({
        NODE_ENV: 'production',
        TURSO_DATABASE_URL: 'libsql://team-health.turso.io',
        RESEND_API_KEY: 're_test',
      }),
    ).not.toThrow();
  });

  it('leaves development alone, where a local file is the right answer', () => {
    expect(() => assertProductionReady({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('leaves the test environment alone, or every other suite would fail', () => {
    expect(() => assertProductionReady({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('leaves an unset NODE_ENV alone rather than guessing it means production', () => {
    expect(() => assertProductionReady({})).not.toThrow();
  });
});

describe('the instrumentation hook', () => {
  it('runs the guard, so the checks are actually wired to startup', async () => {
    // A guard nothing calls is a guard that does not exist. This asserts the
    // wiring rather than re-asserting the rules.
    const { register } = await import('@/instrumentation');

    expect(() => register()).not.toThrow();
  });
});

/**
 * A production process must not be able to serve live sign-in tokens.
 *
 * Requirements: Deployment 5.1, 5.2, 5.3
 * Property: 5
 *
 * `/api/test/magic-link` returns a live magic-link token when `TEST_MODE` is
 * enabled, which is a complete authentication bypass for anyone who can reach
 * it. It is inert otherwise, and the plan has always been "do not set it in
 * production" — which is a hope, not a control.
 *
 * The guard is deliberately broader than the route's own predicate. The route
 * enables only on exactly "true", so `TEST_MODE=1` would be harmless — but it is
 * still someone *trying* to switch this on in production, and a deployment that
 * survives the attempt teaches the wrong lesson. Requirement 5.3 asks that
 * production not define it at all.
 */
describe('assertProductionReady and TEST_MODE', () => {
  /*
   * A production environment with nothing else wrong with it.
   *
   * `RESEND_API_KEY` is here because a production process with no way for
   * anybody to sign in is refused too — these tests are about TEST_MODE, and
   * an environment that failed for a second reason would not exercise it.
   */
  const configured = {
    NODE_ENV: 'production',
    TURSO_DATABASE_URL: 'libsql://x.turso.io',
    RESEND_API_KEY: 're_test',
  };

  it('refuses a production environment with test mode enabled', () => {
    expect(() => assertProductionReady({ ...configured, TEST_MODE: 'true' })).toThrow();
  });

  it('names the variable, so the fix is obvious from the failure', () => {
    expect(() => assertProductionReady({ ...configured, TEST_MODE: 'true' })).toThrow(
      /TEST_MODE/,
    );
  });

  it('says why it matters, rather than only that it is set', () => {
    // Someone reading a failed deploy needs to know this is not pedantry
    expect(() => assertProductionReady({ ...configured, TEST_MODE: 'true' })).toThrow(
      /token/i,
    );
  });

  it('refuses a value that only looks enabled, because someone tried', () => {
    // The route enables on exactly "true", so this one would have been
    // harmless — and a deployment that survives the attempt teaches the wrong
    // lesson about whether the switch exists in production
    expect(() => assertProductionReady({ ...configured, TEST_MODE: '1' })).toThrow(
      /TEST_MODE/,
    );
  });

  it('refuses even an explicit disable, since production should not name it at all', () => {
    expect(() => assertProductionReady({ ...configured, TEST_MODE: 'false' })).toThrow(
      /TEST_MODE/,
    );
  });

  it('allows production that does not mention it', () => {
    expect(() => assertProductionReady(configured)).not.toThrow();
  });

  it('treats an empty value as not defined', () => {
    // Some platforms materialise an unset variable as an empty string
    expect(() => assertProductionReady({ ...configured, TEST_MODE: '' })).not.toThrow();
  });

  it('leaves the E2E suite alone, which needs test mode and is not production', () => {
    expect(() => assertProductionReady({ NODE_ENV: 'test', TEST_MODE: 'true' })).not.toThrow();
    expect(() =>
      assertProductionReady({ NODE_ENV: 'development', TEST_MODE: 'true' }),
    ).not.toThrow();
  });

  it('reports the missing database first when both are wrong', () => {
    // Two problems, one message: the one that must be fixed to get anywhere
    expect(() => assertProductionReady({ NODE_ENV: 'production', TEST_MODE: 'true' })).toThrow(
      /TURSO_DATABASE_URL/,
    );
  });
});

/**
 * Telling a deployment apart from a local end-to-end run.
 *
 * Requirements: Deployment 5.1
 *
 * `NODE_ENV` cannot do it. `next start` sets it to production on a laptop too,
 * and the E2E suite deliberately runs the production build so that CI and a
 * local run exercise the same artifact — with TEST_MODE on, which is the whole
 * point of the token capture that replaced a scenario the suite used to skip.
 *
 * The first version of this guard had no such distinction and stopped the E2E
 * web server from starting at all. The suite caught it; nothing else would have.
 */
describe('assertProductionReady and the end-to-end suite', () => {
  const e2e = {
    NODE_ENV: 'production',
    TEST_MODE: 'true',
    E2E_LOCAL_RUN: 'true',
    DATABASE_URL: 'file:./prisma/e2e.db',
  };

  it('allows the marked end-to-end run that a deployment would fail', () => {
    expect(() => assertProductionReady(e2e)).not.toThrow();
  });

  it('does not need a Turso database for that run', () => {
    // The suite provisions its own local SQLite file, which is the correct
    // answer there and the wrong one in a deployment
    expect(() => assertProductionReady({ ...e2e, TURSO_DATABASE_URL: undefined })).not.toThrow();
  });

  it('fails closed: an unmarked production process is still checked', () => {
    // The property that justifies an opt-out on a security control. A host we
    // have never seen, setting none of the variables we might have keyed on,
    // is still guarded
    expect(() => assertProductionReady({ NODE_ENV: 'production', TEST_MODE: 'true' })).toThrow();
  });

  it('is not satisfied by a value that merely looks like the marker', () => {
    expect(() =>
      assertProductionReady({ NODE_ENV: 'production', TEST_MODE: 'true', E2E_LOCAL_RUN: '1' }),
    ).toThrow();
  });
});

describe('a production process with no way for anybody to sign in', () => {
  /*
   * Requirements: Slack Sign In 5.1, 5.2, 5.3
   *
   * There are two ways in now, and the application is fully usable with
   * either. With neither, every route still answers and the sign-in page still
   * renders — it simply cannot deliver anything, and the person trying to use
   * it sees "check your email" and waits for ever. That is the exact silence
   * the whole Slack sign-in spec exists to remove, so it fails at startup
   * where somebody deploying will meet it.
   */
  const withDatabase = {
    NODE_ENV: 'production',
    TURSO_DATABASE_URL: 'libsql://example.turso.io',
  };

  it('refuses to start', () => {
    expect(() => assertProductionReady(withDatabase)).toThrow();
  });

  it('says what is missing, and that either would do', () => {
    // A guard that stops the deployment without saying which of two variables
    // to set has moved the puzzle rather than solved it
    expect(() => assertProductionReady(withDatabase)).toThrow(/RESEND_API_KEY/);
    expect(() => assertProductionReady(withDatabase)).toThrow(/SLACK_BOT_TOKEN/);
  });

  it('names the consequence, not just the variable', () => {
    expect(() => assertProductionReady(withDatabase)).toThrow(/sign in|signing in/i);
  });
});

describe('a production process with one way in', () => {
  const withDatabase = {
    NODE_ENV: 'production',
    TURSO_DATABASE_URL: 'libsql://example.turso.io',
  };

  it('starts with email alone', () => {
    // Requirement 5.2. The arrangement every deployment had before Slack
    // sign-in existed, and it must keep working unchanged
    expect(() =>
      assertProductionReady({ ...withDatabase, RESEND_API_KEY: 're_test' }),
    ).not.toThrow();
  });

  it('starts with Slack alone', () => {
    /*
     * Requirement 5.1, and the point of the whole spec: a team can be run
     * without a verified sending domain, which is the thing that made this
     * untrialable.
     */
    expect(() =>
      assertProductionReady({ ...withDatabase, SLACK_BOT_TOKEN: 'xoxb-test' }),
    ).not.toThrow();
  });

  it('treats an empty string as absent', () => {
    // A variable set to nothing is the shape a misconfigured deployment takes,
    // and it would otherwise satisfy a presence check
    expect(() =>
      assertProductionReady({ ...withDatabase, RESEND_API_KEY: '', SLACK_BOT_TOKEN: '' }),
    ).toThrow(/SLACK_BOT_TOKEN/);
  });

  it('leaves development alone', () => {
    // The local suites and the dev server have neither, and need neither
    expect(() => assertProductionReady({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('leaves the end-to-end run alone', () => {
    // It marks itself, and captures magic-link tokens in process rather than
    // sending them
    expect(() =>
      assertProductionReady({ ...withDatabase, E2E_LOCAL_RUN: 'true' }),
    ).not.toThrow();
  });
});
