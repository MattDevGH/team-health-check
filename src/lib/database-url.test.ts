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

import { describe, it, expect } from 'vitest';

import { resolveSqliteFileUrl } from './database-url';

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
