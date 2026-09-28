/**
 * Requirements: Deployment 3.8
 *
 * The manifest is what the startup guard compares the ledger against, so a
 * stale one would let a deployment start against a schema it does not match —
 * the exact failure the guard exists to prevent, reintroduced through the
 * thing meant to prevent it.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { readCommittedMigrations, buildManifest, run } from './generate-migration-manifest';

let workDir = '';

function migration(name: string): void {
  mkdirSync(path.join(workDir, 'prisma/migrations', name), { recursive: true });
  writeFileSync(path.join(workDir, 'prisma/migrations', name, 'migration.sql'), 'SELECT 1;');
}

function migrationsDir(): string {
  return path.join(workDir, 'prisma/migrations');
}

function manifestPath(): string {
  return path.join(workDir, 'manifest.ts');
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'thc-manifest-'));
  mkdirSync(path.join(workDir, 'prisma/migrations'), { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('readCommittedMigrations', () => {
  it('returns the directories in the order they apply', () => {
    migration('20260926120000_second');
    migration('20260620233208_first');

    expect(readCommittedMigrations(migrationsDir())).toEqual([
      '20260620233208_first',
      '20260926120000_second',
    ]);
  });

  it('ignores the lock file sitting beside them', () => {
    migration('20260620233208_first');
    writeFileSync(path.join(migrationsDir(), 'migration_lock.toml'), 'provider = "sqlite"');

    expect(readCommittedMigrations(migrationsDir())).toEqual(['20260620233208_first']);
  });

  it('ignores a directory with no migration in it', () => {
    // A half-created directory is not something the database can have applied
    migration('20260620233208_first');
    mkdirSync(path.join(migrationsDir(), '20260701000000_abandoned'));

    expect(readCommittedMigrations(migrationsDir())).toEqual(['20260620233208_first']);
  });
});

describe('buildManifest', () => {
  it('lists every migration', () => {
    const manifest = buildManifest(['20260620233208_first', '20260926120000_second']);

    expect(manifest).toContain("'20260620233208_first',");
    expect(manifest).toContain("'20260926120000_second',");
  });

  it('says not to edit it by hand', () => {
    expect(buildManifest([])).toMatch(/do not edit by hand/i);
  });

  it('handles a project with no migrations yet', () => {
    expect(buildManifest([])).toContain('COMMITTED_MIGRATIONS');
  });
});

describe('the gate', () => {
  function check(): { code: number; out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const code = run(['--check'], { out: m => out.push(m), err: m => err.push(m) }, migrationsDir(), manifestPath());
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  function write(): number {
    return run([], { out: () => {}, err: () => {} }, migrationsDir(), manifestPath());
  }

  it('passes when the manifest matches the directory', () => {
    migration('20260620233208_first');
    write();

    expect(check().code).toBe(0);
  });

  it('fails when a migration has been added and the manifest not regenerated', () => {
    migration('20260620233208_first');
    write();
    migration('20260926120000_second');

    const result = check();

    expect(result.code).toBe(1);
    expect(result.err).toContain('generate-migration-manifest');
  });

  it('fails when the manifest does not exist at all', () => {
    migration('20260620233208_first');

    expect(check().code).toBe(1);
  });

  it('writes a manifest that then satisfies its own check', () => {
    migration('20260620233208_first');
    migration('20260926120000_second');

    expect(write()).toBe(0);
    expect(check().code).toBe(0);
  });

  it('does not care about line endings', () => {
    // The repository holds CRLF; a generator that rewrote them every run
    // would make every commit noisy
    migration('20260620233208_first');
    write();
    const asWritten = readFileSync(manifestPath(), 'utf8');
    writeFileSync(manifestPath(), asWritten.replace(/\n/g, '\r\n'));

    expect(check().code).toBe(0);
  });
});
