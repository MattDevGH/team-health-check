// @vitest-environment node

/**
 * Reading production back, rather than believing an exit code.
 *
 * Requirements: Deployment 3.6; Original 10.1, 10.2; Reaching Your Health
 * Check 1.1
 *
 * Deployment 3.6 asks that a migrated schema be verified by reading it back.
 * Phase 4.2 of `reaching-your-health-check` asks the same of an answer given
 * through the deployed interface: the confirmation on screen is the application
 * agreeing with itself, and the whole milestone exists because a check opened
 * in production that nothing could answer while every test was green.
 *
 * So the reading is a function with tests rather than a shell session somebody
 * reconstructs from memory at the moment they most need it to be right.
 *
 * Exercised over the libSQL adapter against a temporary file, applying the
 * committed migrations — the same client production uses, so a query that
 * works here works there.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inspectProduction } from '@/lib/production-check/verification';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

let workDir: string;
let client: Client;

async function applyMigrations(target: Client): Promise<void> {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const dir of dirs) {
    const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!existsSync(file)) continue;
    await target.executeMultiple(readFileSync(file, 'utf8'));
  }

  await target.executeMultiple(
    `CREATE TABLE IF NOT EXISTS _applied_migration (
       name TEXT NOT NULL PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );
  for (const dir of dirs) {
    await target.execute({
      sql: 'INSERT INTO _applied_migration (name, applied_at) VALUES (?, ?)',
      args: [dir, new Date().toISOString()],
    });
  }
}

/** A team, a member, a closed session, three answers and their aggregates. */
async function seed(target: Client): Promise<void> {
  const now = '2026-09-18T09:00:00.000Z';
  await target.execute({
    sql: 'INSERT INTO Team (id, name, privacyMode, archived, timezone, preSessionRecipient, createdAt, updatedAt) VALUES (?,?,?,0,?,?,?,?)',
    args: ['team-prod', 'Production Team', 'anonymous', 'Europe/London', 'delivery_manager', now, now],
  });
  await target.execute({
    sql: 'INSERT INTO TeamMember (id, teamId, name, email, cadencePreference, remindersEnabled, currentStreak, bestStreak, createdAt) VALUES (?,?,?,?,?,1,0,0,?)',
    args: ['member-prod', 'team-prod', 'Member', 'member@production.invalid', 'weekly', now],
  });
  await target.execute({
    sql: 'INSERT INTO HealthCheckSession (id, teamId, status, actualOpenAt, actualCloseAt, materialisedAt, createdAt) VALUES (?,?,?,?,?,?,?)',
    args: ['session-prod', 'team-prod', 'closed', now, now, now, now],
  });

  const answers: Array<[string, number]> = [
    ['q-delivering-value', 4],
    ['q-team-collaboration', 5],
    ['q-ease-of-delivery', 2],
  ];
  for (const [questionId, score] of answers) {
    await target.execute({
      sql: 'INSERT INTO Question (id, title, description, displayOrder) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
      args: [questionId, 'A question', 'What it asks', 0],
    });
    await target.execute({
      sql: 'INSERT INTO Response (id, memberId, sessionId, questionId, score, submittedAt, updatedAt) VALUES (?,?,?,?,?,?,?)',
      args: [`response-${questionId}`, 'member-prod', 'session-prod', questionId, score, now, now],
    });
    await target.execute({
      sql: 'INSERT INTO SessionAggregate (id, sessionId, questionId, averageScore, responseCount, improvingCount, stableCount, decliningCount, materialisedAt) VALUES (?,?,?,?,?,0,0,0,?)',
      args: [`aggregate-${questionId}`, 'session-prod', questionId, score, 1, now],
    });
  }
}

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'thc-prod-verify-'));
  const dbPath = path.join(workDir, 'verify.db').replace(/\\/g, '/');
  client = createClient({ url: `file:${dbPath}` });

  await applyMigrations(client);
  await seed(client);
}, 60_000);

afterAll(() => {
  client?.close();
  try {
    if (workDir) rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // best effort — the OS reclaims the temp directory
  }
});

describe('the schema, read back', () => {
  it('reports the columns a recent milestone added', async () => {
    /*
     * Deployment 3.6. The columns named here are the ones whose absence would
     * be discovered as an outage rather than a warning: every query against
     * TeamMember selects `emailPromptsEnabled` by name, so an unmigrated
     * production would fail to sign anybody in at all.
     */
    const report = await inspectProduction(client);

    expect(report.columns).toContainEqual({
      table: 'TeamMember',
      column: 'emailPromptsEnabled',
      present: true,
    });
  });

  it('says which migrations the database has recorded', async () => {
    const report = await inspectProduction(client);

    expect(report.migrations.missing, 'migrations committed but not applied').toEqual([]);
    expect(report.migrations.applied).toContain('20260918000000_add_email_prompts_enabled');
  });

  it('says whether the ledger exists at all', async () => {
    /*
     * A database migrated by Prisma locally has every column and no
     * `_applied_migration` table, because that ledger is written only by
     * `scripts/migrate-production.ts`. Without this flag the report reads
     * "every migration missing" against a database that is entirely up to
     * date — and somebody who sees that once stops believing the next one.
     *
     * Found by running the script against `prisma/dev.db` before trusting it
     * with production, which is the order this project insists on.
     */
    const report = await inspectProduction(client);

    expect(report.migrations.ledgerPresent).toBe(true);
  });
});

describe('the latest session, read back', () => {
  it('finds it and counts what was answered', async () => {
    // Original 10.1. The count is the evidence that an answer given in a
    // browser became a row
    const report = await inspectProduction(client);

    expect(report.latestSession).toMatchObject({
      id: 'session-prod',
      status: 'closed',
      responseCount: 3,
      respondentCount: 1,
    });
  });

  it('reports what was stored per question', async () => {
    const report = await inspectProduction(client);

    const delivering = report.latestSession?.perQuestion.find(
      entry => entry.questionId === 'q-delivering-value',
    );
    expect(delivering).toMatchObject({ responseCount: 1, averageScore: 4 });
  });

  it('cross-checks the raw answers against the stored aggregates', async () => {
    /*
     * The averages a dashboard draws come from SessionAggregate, computed once
     * at close. Reading them back proves they exist; recomputing them from the
     * Response rows proves they are right — and disagreeing is exactly the
     * defect a reader of the dashboard could never see.
     */
    const report = await inspectProduction(client);

    expect(report.latestSession?.aggregateDisagreements).toEqual([]);
  });

  it('names a disagreement rather than reporting a clean result', async () => {
    /*
     * Mutation-proof for the check above: without this, a comparison that
     * always returned an empty list would pass every test in this file.
     */
    await client.execute({
      sql: 'UPDATE SessionAggregate SET averageScore = ? WHERE id = ?',
      args: [1, 'aggregate-q-delivering-value'],
    });

    const report = await inspectProduction(client);

    expect(report.latestSession?.aggregateDisagreements).toEqual([
      { questionId: 'q-delivering-value', storedAverage: 1, recomputedAverage: 4 },
    ]);

    await client.execute({
      sql: 'UPDATE SessionAggregate SET averageScore = ? WHERE id = ?',
      args: [4, 'aggregate-q-delivering-value'],
    });
  });
});

describe('what the report must never carry', () => {
  it('holds no email address, session token or magic link', async () => {
    /*
     * This is printed to a terminal and pasted into notes. A session link
     * authenticates whoever holds it, and an address in a pasted log cannot be
     * taken back — so the report is built from ids and counts by construction,
     * and this asserts the construction rather than trusting it.
     */
    const report = await inspectProduction(client);

    const written = JSON.stringify(report);
    expect(written).not.toContain('member@production.invalid');
    expect(written).not.toMatch(/token/i);
  });
});
