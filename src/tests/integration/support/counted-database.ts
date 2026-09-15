/**
 * A real database that counts the queries sent to it.
 *
 * Requirements: Feeling Responsive 4.2
 *
 * The instrument behind this milestone's budgets. It exists because the
 * application's slowness was found by a person using it rather than by the
 * suite, and a number nobody measures is a number that drifts.
 *
 * Three deliberate choices:
 *
 * - **Prisma's query event**, not a wrapper around the driver adapter.
 *   `PrismaLibSql` constructs its own libSQL client from config and will not
 *   accept one, so there is nothing to wrap from outside. The event was checked
 *   empirically first: it fires exactly once per statement sent, including the
 *   BEGIN and COMMIT of an interactive transaction.
 * - **The libSQL adapter**, because that is what production runs. A count taken
 *   through better-sqlite3 would describe a path no deployed request takes.
 * - **A real temporary file**, because a count is a claim about statements
 *   crossing a driver, and a fake has no driver to cross.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

import { PrismaClient } from '@/generated/prisma';
import { applyMigrations } from '@/lib/migrations/apply-migrations';

export interface CountedDatabase {
  prisma: PrismaClient;
  /** Runs the work and reports how many statements it sent. */
  countQueries(work: () => Promise<unknown>): Promise<number>;
  /** The same, keeping what the work returned. */
  measure<T>(work: () => Promise<T>): Promise<{ result: T; queries: number }>;
  close(): Promise<void>;
}

/** A libSQL file URL, which needs forward slashes on every platform. */
function fileUrl(filePath: string): string {
  return `file:${filePath.split(path.sep).join('/')}`;
}

export async function createCountedDatabase(): Promise<CountedDatabase> {
  const workDir = mkdtempSync(path.join(tmpdir(), 'thc-counted-'));
  const url = fileUrl(path.join(workDir, 'counted.db'));

  // Schema first, through a client of its own: migrations are setup, and
  // counting them would attribute the fixture's work to the test's.
  const setup = createClient({ url });
  try {
    await applyMigrations(setup);
  } finally {
    setup.close();
  }

  let statements = 0;

  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url }),
    log: [{ emit: 'event', level: 'query' }],
  });

  /*
   * The generated client's `$on` is typed from the log options it was given,
   * and TypeScript cannot follow that through this indirection. The event is
   * real — verified against the adapter before this was written — so the cast
   * is narrow and named rather than an `any` spreading outwards.
   */
  (prisma as unknown as { $on(event: 'query', callback: () => void): void }).$on('query', () => {
    statements += 1;
  });

  async function measure<T>(work: () => Promise<T>): Promise<{ result: T; queries: number }> {
    /*
     * No warm-up query. One was written here on the assumption that opening a
     * connection lazily would send statements of its own and inflate the first
     * measurement in a run. It does not: a mutation test removed the warm-up
     * and nothing failed, including a measurement taken against a database
     * opened moments earlier. A line whose comment claims it prevents
     * something it does not prevent is worse than no line.
     */
    statements = 0;
    const result = await work();

    return { result, queries: statements };
  }

  return {
    prisma,

    async countQueries(work) {
      const { queries } = await measure(work);
      return queries;
    },

    measure,

    async close() {
      await prisma.$disconnect();
      try {
        rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Windows can hold the file briefly after disconnect; a leftover temp
        // directory must not fail a run
      }
    },
  };
}
