/**
 * Applies the committed migrations to the production database.
 *
 * Requirements: Deployment 3.3, 3.4, 3.5
 *
 *   npx tsx scripts/migrate-production.ts
 *
 * with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment.
 *
 * This exists because `prisma migrate deploy` cannot reach Turso: its datasource
 * takes a plain url and this schema's provider is `sqlite`. `prisma.config.ts`
 * refuses rather than quietly migrating a local file, and names this script.
 *
 * Deliberately a separate command, never part of a deploy (Requirement 3.5). A
 * schema change to a database holding a team's answers is a decision, and
 * folding it into a build makes it a side effect of pressing merge.
 *
 * It prints what it applied and what it skipped, because "exit code 0" is
 * exactly the evidence this milestone exists to stop accepting.
 */

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

import { PrismaClient } from '../src/generated/prisma';
import { applyMigrations } from '../src/lib/migrations/apply-migrations';
import { seedQuestions } from '../prisma/seed';

/** Hides everything but the host, so a token in the URL cannot reach a log. */
function describeTarget(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return '(unparseable URL)';
  }
}

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    console.error(
      'TURSO_DATABASE_URL is not set. This script migrates the production database; ' +
        'for local work use `npx prisma migrate dev` instead.',
    );
    process.exitCode = 1;
    return;
  }

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  try {
    console.log(`Applying migrations to ${describeTarget(url)}`);

    const { applied, skipped } = await applyMigrations(client);

    for (const name of skipped) console.log(`  skipped (already applied)  ${name}`);
    for (const name of applied) console.log(`  applied                    ${name}`);

    if (applied.length === 0) {
      console.log('\nNothing to apply. The schema is up to date.');
    } else {
      console.log(`\nApplied ${applied.length} migration(s).`);
    }
  } finally {
    client.close();
  }

  /*
   * The question catalogue is reference data the application cannot work
   * without — not sample data — so it belongs in the same deliberate step as the
   * schema rather than in a second command someone can forget. It upserts, so
   * running it again is safe and puts back anything edited by hand.
   *
   * Through the libSQL adapter, not the better-sqlite3 one createSeedClient
   * builds: that client cannot reach Turso.
   */
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
  });

  try {
    const seeded = await seedQuestions(prisma);
    console.log(`Seeded ${seeded} fixed questions.`);
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    '\nVerify the schema and the catalogue by reading them back before trusting ' +
      'this. See .kiro/specs/deployment/tasks.md, task 4.2.',
  );
}

main().catch((error: unknown) => {
  // A failed migration must not look like a successful one
  console.error('\nMigration failed. The database may be partially migrated.');
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    '\nIf a migration ran but was not recorded, the next attempt will report that a ' +
      'table already exists. That is the expected symptom; see the note in ' +
      'src/lib/migrations/apply-migrations.ts.',
  );
  process.exitCode = 1;
});
