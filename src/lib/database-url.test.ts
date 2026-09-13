/**
 * Tests for resolving which SQLite file the runtime opens.
 *
 * The runtime previously hardcoded `prisma/dev.db` and ignored DATABASE_URL
 * entirely, so an E2E run configured with `DATABASE_URL=file:./test.db` still
 * read and wrote the development database holding accepted acceptance data.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import path from 'node:path';

import { afterEach, describe, it, expect } from 'vitest';

import {
  cliCommandConnectsToDatabase,
  resolveCliDatasourceUrl,
  resolveSqliteFileUrl,
} from './database-url';

const root = process.cwd();
const asUrl = (...segments: string[]) => `file:${path.resolve(root, ...segments).replace(/\\/g, '/')}`;

describe('resolveSqliteFileUrl', () => {
  it('defaults to the development database when nothing is configured', () => {
    expect(resolveSqliteFileUrl(undefined)).toBe(asUrl('prisma', 'dev.db'));
  });

  it('defaults when the configured value is blank', () => {
    expect(resolveSqliteFileUrl('')).toBe(asUrl('prisma', 'dev.db'));
    expect(resolveSqliteFileUrl('   ')).toBe(asUrl('prisma', 'dev.db'));
  });

  it('honours a relative file: URL, resolved from the project root', () => {
    expect(resolveSqliteFileUrl('file:./test.db')).toBe(asUrl('test.db'));
    expect(resolveSqliteFileUrl('file:test.db')).toBe(asUrl('test.db'));
  });

  it('honours a nested relative path', () => {
    expect(resolveSqliteFileUrl('file:./prisma/e2e.db')).toBe(asUrl('prisma', 'e2e.db'));
  });

  it('honours a bare path with no file: prefix', () => {
    expect(resolveSqliteFileUrl('./e2e/data.db')).toBe(asUrl('e2e', 'data.db'));
  });

  it('preserves an absolute path', () => {
    const absolute = path.resolve(root, 'tmp', 'absolute.db').replace(/\\/g, '/');

    expect(resolveSqliteFileUrl(`file:${absolute}`)).toBe(`file:${absolute}`);
  });

  it('never falls back to the development database when a path is configured', () => {
    // The whole point of the setting: an E2E run must not touch dev.db
    expect(resolveSqliteFileUrl('file:./test.db')).not.toContain('dev.db');
  });
});

/**
 * The datasource the Prisma CLI is allowed to touch.
 *
 * Requirements: Deployment 3.1, 3.2
 * Property: 2
 *
 * `prisma migrate deploy` cannot target Turso and cannot be made to: Prisma's
 * `Datasource` accepts only a url string, the schema's provider is `sqlite`, and
 * Prisma's own documentation sends Turso users elsewhere.
 *
 * The hazard is not that limitation. It is that `prisma.config.ts` resolved its
 * url through `resolveSqliteFileUrl()`, which ignores TURSO_DATABASE_URL and
 * returns a local path — so running the CLI with production credentials in the
 * environment migrated a local file and exited zero. It reported success for
 * work it had not done, which is the failure this repository has a testing rule
 * about.
 */
describe('resolveCliDatasourceUrl', () => {
  const original = process.env.TURSO_DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = original;
  });

  it('refuses to resolve anything while a Turso database is configured', () => {
    process.env.TURSO_DATABASE_URL = 'libsql://team-health.turso.io';

    expect(() => resolveCliDatasourceUrl()).toThrow();
  });

  it('points the reader at the path that does work', () => {
    // A refusal that only says no leaves someone to discover the alternative by
    // searching. The message names the script.
    process.env.TURSO_DATABASE_URL = 'libsql://team-health.turso.io';

    expect(() => resolveCliDatasourceUrl()).toThrow(/migrate-production/);
  });

  it('explains that the CLI cannot reach Turso, rather than implying it is forbidden', () => {
    process.env.TURSO_DATABASE_URL = 'libsql://team-health.turso.io';

    expect(() => resolveCliDatasourceUrl()).toThrow(/cannot/i);
  });

  it('resolves normally when no Turso database is configured', () => {
    delete process.env.TURSO_DATABASE_URL;

    expect(resolveCliDatasourceUrl()).toBe(resolveSqliteFileUrl());
  });

  it('treats a blank Turso URL as absent, the way the runtime does', () => {
    // `createPrismaClient` branches on truthiness. If these two disagreed, one
    // would refuse while the other opened a local file — the precise
    // disagreement this guard exists to prevent.
    process.env.TURSO_DATABASE_URL = '';

    expect(resolveCliDatasourceUrl()).toBe(resolveSqliteFileUrl());
  });

  it('still honours DATABASE_URL for local work', () => {
    delete process.env.TURSO_DATABASE_URL;
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./e2e-probe.db';

    try {
      expect(resolveCliDatasourceUrl()).toBe(asUrl('e2e-probe.db'));
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});

/**
 * Which Prisma commands the Turso guard should stop.
 * Requirements: Deployment 3.1
 *
 * The guard was written to refuse everything while TURSO_DATABASE_URL is set,
 * and a Vercel deployment proved that too broad. `prisma generate` reads the
 * schema and writes a client; it never opens a database. Blocking it means the
 * production build cannot generate its Prisma client at all — the build fails
 * with "Can't resolve '@/generated/prisma'", which looks nothing like a guard
 * doing its job.
 *
 * The rule is therefore about *connecting*, not about the CLI in general. An
 * allowlist rather than a blocklist, so a command nobody anticipated is refused
 * rather than quietly permitted — the same fail-closed reasoning as the
 * TEST_MODE guard.
 */
describe('cliCommandConnectsToDatabase', () => {
  it('lets generate through, because it never opens a database', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'generate'])).toBe(false);
  });

  it('lets the other schema-only commands through', () => {
    for (const command of ['format', 'validate', 'version']) {
      expect(cliCommandConnectsToDatabase(['node', 'prisma', command]), command).toBe(false);
    }
  });

  it('stops migrate, which is the command the guard exists for', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'migrate', 'deploy'])).toBe(true);
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'migrate', 'dev'])).toBe(true);
  });

  it('stops db push and db execute, which write to whatever they resolve', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'db', 'push'])).toBe(true);
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'db', 'execute'])).toBe(true);
  });

  it('stops studio, which reads a database it should not be reading', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'studio'])).toBe(true);
  });

  it('fails closed on a command it has never heard of', () => {
    // A future Prisma command that connects must be refused by default. The
    // cost of being wrong this way is a loud error; the other way it is silence.
    expect(cliCommandConnectsToDatabase(['node', 'prisma', 'some-future-command'])).toBe(true);
  });

  it('fails closed when there is no command at all', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma'])).toBe(true);
  });

  it('ignores flags when finding the command', () => {
    expect(cliCommandConnectsToDatabase(['node', 'prisma', '--schema=x', 'generate'])).toBe(false);
  });
});

describe('resolveCliDatasourceUrl and the command it was invoked for', () => {
  const original = process.env.TURSO_DATABASE_URL;
  const originalArgv = process.argv;

  afterEach(() => {
    if (original === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = original;
    process.argv = originalArgv;
  });

  it('resolves for generate even while a Turso database is configured', () => {
    // The production build runs this with TURSO_DATABASE_URL set, because the
    // host supplies it to the build as well as the runtime
    process.env.TURSO_DATABASE_URL = 'libsql://team-health.turso.io';
    process.argv = ['node', 'prisma', 'generate'];

    expect(() => resolveCliDatasourceUrl()).not.toThrow();
  });

  it('still refuses migrate while a Turso database is configured', () => {
    process.env.TURSO_DATABASE_URL = 'libsql://team-health.turso.io';
    process.argv = ['node', 'prisma', 'migrate', 'deploy'];

    expect(() => resolveCliDatasourceUrl()).toThrow(/migrate-production/);
  });
});
