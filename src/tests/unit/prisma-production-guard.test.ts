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
 * The guard is deliberately at module load. A process that cannot reach its
 * database should fail to boot, not fail one request at a time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Imports the module fresh, so the top-level client construction runs again
 * under whatever environment the test has set.
 *
 * `globalThis.prisma` is cleared too: the module memoises there outside
 * production, and a client cached by an earlier test would short-circuit the
 * construction this one is trying to observe.
 */
async function importPrismaModule() {
  vi.resetModules();
  Reflect.deleteProperty(globalThis, 'prisma');
  return import('@/lib/prisma');
}

describe('the production database guard', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, 'prisma');
  });

  it('refuses to start in production without a database URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURSO_DATABASE_URL', '');

    await expect(importPrismaModule()).rejects.toThrow();
  });

  it('names the missing variable, because the reader is staring at a failed deploy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURSO_DATABASE_URL', '');

    await expect(importPrismaModule()).rejects.toThrow(/TURSO_DATABASE_URL/);
  });

  it('says what would have happened, not merely that something is unset', async () => {
    // "TURSO_DATABASE_URL is not set" leaves the reader to work out why it
    // matters. The cost — a local file that cannot persist — is the point.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURSO_DATABASE_URL', '');

    await expect(importPrismaModule()).rejects.toThrow(/production/i);
  });

  it('starts in production when the database URL is present', async () => {
    // A file: URL is a real libSQL target — the same trick the libSQL
    // integration test uses to exercise the production adapter without an
    // account — so this proves the guard lets a configured production through
    // rather than merely that it throws less often.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURSO_DATABASE_URL', 'file:./prisma/guard-probe.db');

    const mod = await importPrismaModule();
    expect(mod.prisma).toBeDefined();
    await mod.prisma.$disconnect();
  });

  it('leaves development alone, where a local file is the right answer', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TURSO_DATABASE_URL', '');

    const mod = await importPrismaModule();
    expect(mod.prisma).toBeDefined();
    await mod.prisma.$disconnect();
  });

  it('leaves the test environment alone, or every other suite would fail', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TURSO_DATABASE_URL', '');

    const mod = await importPrismaModule();
    expect(mod.prisma).toBeDefined();
    await mod.prisma.$disconnect();
  });
});
