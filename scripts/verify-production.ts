/**
 * Reads the production database back and prints what is actually there.
 *
 * Requirements: Deployment 3.6; Original 10.1; Reaching Your Health Check 1.1
 *
 *   npx tsx scripts/verify-production.ts
 *
 * with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the environment, or in
 * `.env.turso` — the same file `scripts/migrate-production.ts` reads, and for
 * the same reason: Next.js has never heard of that name, so production
 * credentials sitting in it cannot repoint a dev server.
 *
 * **Read-only.** Every statement behind this is a SELECT or a PRAGMA. That
 * matters more than usual here: the current Turso plan has no point-in-time
 * restore, so a script pointed at production is a script that had better not
 * be able to write.
 *
 * Two questions, both of which this project has been caught out by:
 *
 *   - Has the schema actually been migrated? Deployment 3.6 exists because an
 *     exit code said yes once while a local file had been migrated instead.
 *   - Did an answer given in the deployed interface become a row? The
 *     confirmation on screen is the application agreeing with itself, and the
 *     milestone this serves exists because a check opened in production that
 *     nothing could answer while every test was green.
 *
 * It prints ids and counts. No address, no token: this output gets pasted into
 * notes, and a session link authenticates whoever holds it.
 */

import { createClient } from '@libsql/client';

import { inspectProduction } from '../src/lib/production-check/verification';

for (const file of ['.env.turso', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent, which is expected for at least one of them
  }
}

/** Hides everything but the host, so a token in the URL cannot reach a log. */
function describeTarget(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return '(unparseable URL)';
  }
}

function formatDate(value: string | null): string {
  if (!value) return 'never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    console.error(
      'TURSO_DATABASE_URL is not set. Put it in .env.turso, or pass it for one run:\n' +
        '  TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npx tsx scripts/verify-production.ts',
    );
    process.exitCode = 1;
    return;
  }

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  try {
    console.log(`Reading ${describeTarget(url)}\n`);

    const report = await inspectProduction(client);

    console.log('Migrations');
    if (!report.migrations.ledgerPresent) {
      // A local Prisma-managed file looks exactly like this and is fine. Saying
      // so beats printing every migration as missing against an up-to-date
      // database, which teaches a reader to discount the next report
      console.log('  no _applied_migration ledger — this database has never been migrated');
      console.log('  by scripts/migrate-production.ts. Expected for a local Prisma database;');
      console.log('  the column list below is what says whether the schema is current.');
    } else {
      console.log(`  recorded as applied  ${report.migrations.applied.length}`);
      if (report.migrations.missing.length === 0) {
        console.log('  committed but not applied  none');
      } else {
        console.log('  committed but NOT applied:');
        for (const name of report.migrations.missing) console.log(`    ${name}`);
      }
    }

    console.log('\nColumns that must exist');
    for (const check of report.columns) {
      console.log(`  ${check.present ? 'present' : 'MISSING'}  ${check.table}.${check.column}`);
    }

    const session = report.latestSession;
    console.log('\nMost recent health check');
    if (!session) {
      console.log('  none — no session has ever been opened on this database');
    } else {
      console.log(`  session      ${session.id}`);
      console.log(`  team         ${session.teamId}`);
      console.log(`  status       ${session.status}`);
      console.log(`  opened       ${formatDate(session.actualOpenAt)}`);
      console.log(`  closed       ${formatDate(session.actualCloseAt)}`);
      console.log(`  materialised ${formatDate(session.materialisedAt)}`);
      console.log(
        `  answers      ${session.responseCount} from ${session.respondentCount} member(s)`,
      );

      if (session.perQuestion.length > 0) {
        console.log('\n  Per question, recomputed from the stored answers:');
        for (const entry of session.perQuestion) {
          console.log(
            `    ${entry.questionId.padEnd(26)} ${entry.responseCount} answer(s), average ${entry.averageScore.toFixed(2)}`,
          );
        }
      }

      if (session.aggregateDisagreements.length === 0) {
        console.log('\n  Stored aggregates agree with the raw answers.');
      } else {
        console.log('\n  STORED AGGREGATES DISAGREE WITH THE RAW ANSWERS:');
        for (const row of session.aggregateDisagreements) {
          console.log(
            `    ${row.questionId}: dashboard shows ${row.storedAverage}, answers give ${row.recomputedAverage}`,
          );
        }
      }
    }

    /*
     * A missing column is behind; a missing ledger entry is only behind when
     * there is a ledger to be missing from. The columns are the load-bearing
     * check either way — they are read from the database itself rather than
     * from a record of what somebody meant to do to it.
     */
    const broken =
      report.columns.some(check => !check.present) ||
      (report.migrations.ledgerPresent && report.migrations.missing.length > 0);
    if (broken) {
      console.error(
        '\nThis database is behind the code in this checkout. Run:\n' +
          '  npx tsx scripts/migrate-production.ts',
      );
      process.exitCode = 1;
    }
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error('Verification failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
