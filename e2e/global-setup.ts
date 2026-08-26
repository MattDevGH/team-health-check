/**
 * Provisions a disposable, fully seeded database before the E2E run.
 *
 * Every run starts from an empty file, applies the committed migrations, and
 * seeds the canonical questions. Nothing is inherited from a previous run and
 * `prisma/dev.db` is never opened, so E2E tests cannot depend on — or damage —
 * development data.
 *
 * Failures here are fatal on purpose. A run against an unmigrated or unseeded
 * database would otherwise surface as confusing assertion failures, or worse,
 * as tests that skip themselves.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../src/generated/prisma';
import { seedQuestions } from '../prisma/seed';
import { E2E_DATABASE_FILE, e2eDatabaseUrl } from './database';

const ROOT = path.resolve(__dirname, '..');

/**
 * Applies migrations by running the Prisma CLI's entry point under the current
 * Node binary. Spawning `npx` would mean a shell on Windows: Node 24 refuses to
 * spawn `.cmd` shims directly, and `shell: true` concatenates arguments rather
 * than escaping them (DEP0190).
 */
function migrate(databaseUrl: string): void {
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = e2eDatabaseUrl();
  const file = path.resolve(ROOT, E2E_DATABASE_FILE);

  if (path.basename(file) === 'dev.db') {
    throw new Error('E2E setup refused to run: the configured database is the development database');
  }

  // Start from nothing so a run can never inherit earlier state
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const candidate = `${file}${suffix}`;
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }

  console.log(`[e2e] provisioning ${databaseUrl}`);
  migrate(databaseUrl);

  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  try {
    const seeded = await seedQuestions(client);
    console.log(`[e2e] migrated and seeded ${seeded} questions`);
  } finally {
    await client.$disconnect();
  }
}
