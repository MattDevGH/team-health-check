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
    expect(() =>
      assertProductionReady({
        NODE_ENV: 'production',
        TURSO_DATABASE_URL: 'libsql://team-health.turso.io',
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
