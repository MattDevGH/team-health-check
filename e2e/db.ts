/**
 * Direct reads (and deliberate writes) against the disposable E2E database.
 *
 * Used to cross-check what the browser displays. "The dashboard shows 3.5"
 * proves rendering, not correctness; comparing it with the stored aggregate
 * proves the number is right.
 *
 * Only ever opens the E2E database, never `prisma/dev.db`.
 *
 * Requirements: 10.1, 10.3, 10.4
 */

import path from 'node:path';

import Database from 'better-sqlite3';

import { E2E_DATABASE_FILE } from './database';

const FILE = path.resolve(__dirname, '..', E2E_DATABASE_FILE);

if (path.basename(FILE) === 'dev.db') {
  throw new Error('E2E helpers refused to open the development database');
}

function open(readonly: boolean): Database.Database {
  return new Database(FILE, { readonly });
}

/** Runs a read against the E2E database and always closes the handle. */
export function read<T>(fn: (db: Database.Database) => T): T {
  const db = open(true);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Runs a write against the E2E database. Reserved for test setup. */
export function write<T>(fn: (db: Database.Database) => T): T {
  const db = open(false);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export interface TeamRow {
  id: string;
  name: string;
  privacyMode: string;
}

export function findTeamByName(name: string): TeamRow | undefined {
  return read(db =>
    db.prepare('SELECT id, name, privacyMode FROM Team WHERE name = ?').get(name),
  ) as TeamRow | undefined;
}

export function findMemberEmail(teamId: string, email: string): { id: string } | undefined {
  return read(db =>
    db.prepare('SELECT id FROM TeamMember WHERE teamId = ? AND email = ?').get(teamId, email),
  ) as { id: string } | undefined;
}

export function findOpenSession(teamId: string): { id: string } | undefined {
  return read(db =>
    db.prepare("SELECT id FROM HealthCheckSession WHERE teamId = ? AND status = 'open'").get(teamId),
  ) as { id: string } | undefined;
}

export function findSessionLinkToken(memberId: string, sessionId: string): string | undefined {
  const row = read(db =>
    db
      .prepare('SELECT token FROM SessionLink WHERE memberId = ? AND sessionId = ?')
      .get(memberId, sessionId),
  ) as { token: string } | undefined;

  return row?.token;
}

export function responsesForSession(sessionId: string): Array<{ questionId: string; score: number; trendIndicator: string | null }> {
  return read(db =>
    db
      .prepare('SELECT questionId, score, trendIndicator FROM Response WHERE sessionId = ? ORDER BY questionId')
      .all(sessionId),
  ) as Array<{ questionId: string; score: number; trendIndicator: string | null }>;
}

export function aggregatesForSession(sessionId: string): Array<{
  questionId: string;
  averageScore: number;
  responseCount: number;
  improvingCount: number;
  stableCount: number;
  decliningCount: number;
}> {
  return read(db =>
    db
      .prepare(
        `SELECT questionId, averageScore, responseCount, improvingCount, stableCount, decliningCount
         FROM SessionAggregate WHERE sessionId = ? ORDER BY questionId`,
      )
      .all(sessionId),
  ) as Array<{
    questionId: string;
    averageScore: number;
    responseCount: number;
    improvingCount: number;
    stableCount: number;
    decliningCount: number;
  }>;
}

/**
 * Backdates a closed session so the scheduler's quiet period has elapsed.
 *
 * Materialisation deliberately waits 30 seconds after close so late writes
 * settle. Waiting that out per session would add a minute to every run, so the
 * clock is moved instead of the test sleeping.
 */
export function backdateClose(sessionId: string, secondsAgo = 120): void {
  const when = new Date(Date.now() - secondsAgo * 1000).toISOString();
  write(db => db.prepare('UPDATE HealthCheckSession SET actualCloseAt = ? WHERE id = ?').run(when, sessionId));
}
