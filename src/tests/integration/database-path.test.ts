// @vitest-environment node

/**
 * Execution evidence that the runtime opens the configured database.
 *
 * Asserting the resolved URL is not enough: the previous code built a correct
 * path and then ignored it, and a construction-only test would still pass. This
 * writes through a real client and checks both that the configured file
 * received the data and that `prisma/dev.db` was not touched.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');
const DEV_DB = path.resolve(process.cwd(), 'prisma', 'dev.db');

let workDir: string;
let dbPath: string;
let devDbBefore: { size: number; mtimeMs: number } | null = null;

/** Applies the committed migrations straight to a fresh SQLite file. */
function applyMigrations(file: string): void {
  const db = new Database(file);
  try {
    for (const dir of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()) {
      const sql = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (existsSync(sql)) db.exec(readFileSync(sql, 'utf8'));
    }
  } finally {
    db.close();
  }
}

describe('runtime database path', () => {
  beforeAll(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-dbpath-'));
    dbPath = path.join(workDir, 'configured.db');
    applyMigrations(dbPath);

    if (existsSync(DEV_DB)) {
      const stat = statSync(DEV_DB);
      devDbBefore = { size: stat.size, mtimeMs: stat.mtimeMs };
    }
  });

  afterAll(() => {
    try {
      if (workDir) rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best effort on Windows file locks
    }
  });

  it('writes to the configured database rather than the development one', async () => {
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
    delete process.env.TURSO_DATABASE_URL;

    const { createPrismaClient } = await import('@/lib/prisma');
    const client = createPrismaClient();

    try {
      await client.team.create({ data: { name: 'Configured Path Team' } });

      const found = await client.team.findFirst({ where: { name: 'Configured Path Team' } });
      expect(found).not.toBeNull();
    } finally {
      await client.$disconnect();
      delete process.env.DATABASE_URL;
    }

    // The row must exist in the configured file, read independently of Prisma
    const raw = new Database(dbPath, { readonly: true });
    const row = raw.prepare('SELECT COUNT(*) AS n FROM Team WHERE name = ?').get('Configured Path Team') as { n: number };
    raw.close();
    expect(row.n).toBe(1);
  });

  it('leaves the development database untouched', () => {
    if (!devDbBefore) return; // no dev.db in this environment

    const stat = statSync(DEV_DB);
    expect(stat.size).toBe(devDbBefore.size);
    expect(stat.mtimeMs).toBe(devDbBefore.mtimeMs);
  });
});
