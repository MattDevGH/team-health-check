/**
 * Reads the production database back and reports what is actually there.
 *
 * Requirements: Deployment 3.6; Original 10.1, 10.2; Reaching Your Health
 * Check 1.1
 *
 * Deployment 3.6 asks that a migrated schema be verified by reading it back
 * rather than inferred from an exit code, and phase 4.2 asks the same of an
 * answer given through the deployed interface. Both are the same discipline:
 * the application agreeing with itself is not evidence.
 *
 * Read-only by construction. Every statement here is a SELECT or a PRAGMA, so
 * running it against a database holding a team's answers cannot change them —
 * which matters more than usual, because there is no point-in-time restore on
 * the current Turso plan.
 *
 * Built from ids and counts. The report is printed to a terminal and pasted
 * into notes: a session link authenticates whoever holds it, and an address in
 * a pasted log cannot be taken back.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The slice of a libSQL client this needs.
 *
 * Narrow on purpose: a parameter that cannot write is easier to trust than a
 * comment promising not to.
 */
export interface ReadableClient {
  execute(
    statement: string | { sql: string; args: unknown[] },
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ColumnCheck {
  table: string;
  column: string;
  present: boolean;
}

export interface QuestionTotals {
  questionId: string;
  responseCount: number;
  averageScore: number;
}

export interface AggregateDisagreement {
  questionId: string;
  /** What `SessionAggregate` holds, which is what a dashboard draws. */
  storedAverage: number;
  /** The same figure recomputed from the `Response` rows. */
  recomputedAverage: number;
}

export interface SessionReading {
  id: string;
  teamId: string;
  status: string;
  actualOpenAt: string | null;
  actualCloseAt: string | null;
  materialisedAt: string | null;
  responseCount: number;
  /** Distinct members who answered, which is not the number of answers. */
  respondentCount: number;
  perQuestion: QuestionTotals[];
  /**
   * Questions where the stored average and the recomputed one differ.
   *
   * Empty is the expected result. A non-empty list means the dashboard is
   * drawing a number the raw answers do not support, which is invisible to
   * anybody reading the dashboard.
   */
  aggregateDisagreements: AggregateDisagreement[];
}

export interface ProductionReport {
  migrations: {
    applied: string[];
    /** Committed here, absent from the database's ledger. */
    missing: string[];
    /**
     * Whether `_applied_migration` exists.
     *
     * False means this database has never been migrated by
     * `scripts/migrate-production.ts` — which is true of a local Prisma-managed
     * file, and says nothing about whether its schema is current. Without this,
     * such a database reports every migration as missing while being entirely
     * up to date, and a reader who sees that once stops believing the next one.
     */
    ledgerPresent: boolean;
  };
  columns: ColumnCheck[];
  latestSession: SessionReading | null;
}

const LEDGER_TABLE = '_applied_migration';

/**
 * Columns whose absence would be an outage rather than a warning.
 *
 * Every query against `TeamMember` selects `emailPromptsEnabled` by name, so an
 * unmigrated production cannot sign anybody in. `materialisedAt` is what tells
 * "results not computed yet" from "nobody answered".
 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'TeamMember', column: 'emailPromptsEnabled' },
  { table: 'HealthCheckSession', column: 'materialisedAt' },
  { table: 'SchedulerHeartbeat', column: 'ranAt' },
  { table: 'SchedulerTickRecord', column: 'reasons' },
];

/** Migration directory names committed to this checkout, in order. */
function committedMigrations(): string[] {
  const dir = path.resolve(process.cwd(), 'prisma', 'migrations');
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => existsSync(path.join(dir, name, 'migration.sql')))
    .sort();
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function toText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Two averages agree when they round the same way at two decimal places. */
function roundedAlike(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

async function readAppliedMigrations(
  client: ReadableClient,
): Promise<{ names: string[]; ledgerPresent: boolean }> {
  try {
    const result = await client.execute(`SELECT name FROM ${LEDGER_TABLE} ORDER BY name`);
    return { names: result.rows.map(row => String(row.name)), ledgerPresent: true };
  } catch {
    // No ledger at all: a database this tool has never migrated. Reported as
    // such rather than as an error, because that is exactly what it means —
    // and distinguished from an empty ledger, because a Prisma-managed local
    // file has no ledger and a complete schema
    return { names: [], ledgerPresent: false };
  }
}

async function readColumns(client: ReadableClient): Promise<ColumnCheck[]> {
  const checks: ColumnCheck[] = [];

  for (const { table, column } of REQUIRED_COLUMNS) {
    let present = false;
    try {
      // PRAGMA rather than a SELECT against the column: a missing column would
      // throw, and "it threw" cannot distinguish absent from unreachable
      const result = await client.execute(`PRAGMA table_info("${table}")`);
      present = result.rows.some(row => String(row.name) === column);
    } catch {
      present = false;
    }
    checks.push({ table, column, present });
  }

  return checks;
}

/**
 * The most recent session by when it opened.
 *
 * Opened rather than closed, so a check still collecting is the one reported —
 * which is the one somebody verifying a production pass has just answered.
 */
async function readLatestSession(client: ReadableClient): Promise<SessionReading | null> {
  const sessions = await client.execute(
    `SELECT id, teamId, status, actualOpenAt, actualCloseAt, materialisedAt
       FROM HealthCheckSession
      ORDER BY actualOpenAt DESC
      LIMIT 1`,
  );

  const session = sessions.rows[0];
  if (!session) return null;

  const id = String(session.id);

  const totals = await client.execute({
    sql: `SELECT COUNT(*) AS responses, COUNT(DISTINCT memberId) AS respondents
            FROM Response
           WHERE sessionId = ?`,
    args: [id],
  });

  const perQuestionRows = await client.execute({
    sql: `SELECT questionId, COUNT(*) AS responseCount, AVG(score) AS averageScore
            FROM Response
           WHERE sessionId = ?
        GROUP BY questionId
        ORDER BY questionId`,
    args: [id],
  });

  const perQuestion: QuestionTotals[] = perQuestionRows.rows.map(row => ({
    questionId: String(row.questionId),
    responseCount: toNumber(row.responseCount),
    averageScore: toNumber(row.averageScore),
  }));

  const aggregateRows = await client.execute({
    sql: `SELECT questionId, averageScore
            FROM SessionAggregate
           WHERE sessionId = ?
        ORDER BY questionId`,
    args: [id],
  });

  /*
   * Compared only where both exist.
   *
   * A session whose aggregates have not been materialised yet has no stored
   * average to disagree with, and reporting every question as a disagreement
   * would bury a real one under noise. `materialisedAt` above says which case
   * you are in.
   */
  const aggregateDisagreements: AggregateDisagreement[] = [];
  for (const row of aggregateRows.rows) {
    const questionId = String(row.questionId);
    const storedAverage = toNumber(row.averageScore);
    const recomputed = perQuestion.find(entry => entry.questionId === questionId);
    if (!recomputed) continue;
    if (roundedAlike(storedAverage, recomputed.averageScore)) continue;

    aggregateDisagreements.push({
      questionId,
      storedAverage,
      recomputedAverage: recomputed.averageScore,
    });
  }

  return {
    id,
    teamId: String(session.teamId),
    status: String(session.status),
    actualOpenAt: toText(session.actualOpenAt),
    actualCloseAt: toText(session.actualCloseAt),
    materialisedAt: toText(session.materialisedAt),
    responseCount: toNumber(totals.rows[0]?.responses),
    respondentCount: toNumber(totals.rows[0]?.respondents),
    perQuestion,
    aggregateDisagreements,
  };
}

export async function inspectProduction(client: ReadableClient): Promise<ProductionReport> {
  const [ledger, columns, latestSession] = await Promise.all([
    readAppliedMigrations(client),
    readColumns(client),
    readLatestSession(client),
  ]);

  const recorded = new Set(ledger.names);

  return {
    migrations: {
      applied: ledger.names,
      missing: committedMigrations().filter(name => !recorded.has(name)),
      ledgerPresent: ledger.ledgerPresent,
    },
    columns,
    latestSession,
  };
}
