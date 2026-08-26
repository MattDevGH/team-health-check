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
 * Seeds a team with one delivery-manager member, removing any previous data for
 * the same names first.
 *
 * Idempotent because Playwright restarts its worker after a failure, re-running
 * beforeAll hooks, and CI retries do the same.
 */
export function seedTeam(options: {
  teamName: string;
  memberEmail: string;
  privacyMode?: 'anonymous' | 'attributed';
}): { teamId: string; memberId: string } {
  return write(db => {
    const teamId = `e2e-team-${slug(options.teamName)}`;
    const memberId = `e2e-member-${slug(options.memberEmail)}`;
    const now = new Date().toISOString();

    const sessionIds = db
      .prepare('SELECT id FROM HealthCheckSession WHERE teamId = ?')
      .all(teamId) as Array<{ id: string }>;
    for (const { id } of sessionIds) {
      db.prepare('DELETE FROM SessionAggregate WHERE sessionId = ?').run(id);
      db.prepare('DELETE FROM Response WHERE sessionId = ?').run(id);
      db.prepare('DELETE FROM SessionLink WHERE sessionId = ?').run(id);
    }
    db.prepare('DELETE FROM HealthCheckSession WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM TeamMemberRole WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM UserSession WHERE memberId = ?').run(memberId);
    db.prepare('DELETE FROM MagicLink WHERE memberId = ?').run(memberId);
    db.prepare('DELETE FROM TeamMember WHERE teamId = ?').run(teamId);
    db.prepare('DELETE FROM Team WHERE id = ?').run(teamId);

    db.prepare(
      'INSERT INTO Team (id, name, privacyMode, archived, timezone, preSessionRecipient, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
    ).run(teamId, options.teamName, options.privacyMode ?? 'anonymous', 'Europe/London', 'delivery_manager', now, now);

    db.prepare(
      'INSERT INTO TeamMember (id, teamId, name, email, cadencePreference, remindersEnabled, currentStreak, bestStreak, createdAt) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?)',
    ).run(memberId, teamId, 'Fixture Owner', options.memberEmail, 'weekly', now);

    db.prepare(
      'INSERT INTO TeamMemberRole (id, memberId, teamId, role, assignedAt) VALUES (?, ?, ?, ?, ?)',
    ).run(`${memberId}-role`, memberId, teamId, 'delivery_manager', now);

    return { teamId, memberId };
  });
}

/** Seeds one session plus the member's link to it, returning that link token. */
export function seedSession(options: {
  teamId: string;
  memberId: string;
  index?: number;
  status: 'open' | 'closed';
  closedAt?: Date;
  aggregates?: SeededAggregate[];
}): { sessionId: string; token: string } {
  return write(db => {
    const sessionId = `${options.teamId}-session-${options.index ?? 0}`;
    const token = `e2e-link-${slug(sessionId)}`;
    const stamp = (options.closedAt ?? new Date()).toISOString();

    db.prepare(
      'INSERT INTO HealthCheckSession (id, teamId, status, actualOpenAt, actualCloseAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(sessionId, options.teamId, options.status, stamp, options.status === 'closed' ? stamp : null, stamp);

    db.prepare(
      'INSERT INTO SessionLink (id, token, memberId, sessionId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      `${sessionId}-link`,
      token,
      options.memberId,
      sessionId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      stamp,
    );

    for (const aggregate of options.aggregates ?? []) {
      db.prepare(
        'INSERT INTO SessionAggregate (id, sessionId, questionId, averageScore, responseCount, improvingCount, stableCount, decliningCount, materialisedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        `${sessionId}-${aggregate.questionId}`,
        sessionId,
        aggregate.questionId,
        aggregate.averageScore,
        aggregate.responseCount,
        aggregate.improvingCount,
        aggregate.stableCount,
        aggregate.decliningCount,
        stamp,
      );
    }

    return { sessionId, token };
  });
}

export interface SeededAggregate {
  questionId: string;
  averageScore: number;
  responseCount: number;
  improvingCount: number;
  stableCount: number;
  decliningCount: number;
}

/**
 * Seeds a team, one member, and closed sessions with materialised aggregates.
 *
 * Used by specs whose subject is rendering rather than creation — the journey
 * already proves the app can produce this state through its own flows. Seeding
 * directly is what makes it possible to set response counts above the anonymity
 * threshold, and distributions that a single respondent could never produce.
 */
export function seedClosedSessions(options: {
  teamName: string;
  memberEmail: string;
  privacyMode: 'anonymous' | 'attributed';
  sessions: Array<{ closedAt: Date; aggregates: SeededAggregate[] }>;
}): { teamId: string; memberId: string } {
  const team = seedTeam({
    teamName: options.teamName,
    memberEmail: options.memberEmail,
    privacyMode: options.privacyMode,
  });

  options.sessions.forEach((session, index) => {
    seedSession({
      teamId: team.teamId,
      memberId: team.memberId,
      index,
      status: 'closed',
      closedAt: session.closedAt,
      aggregates: session.aggregates,
    });
  });

  return team;
}

/** Lowercase, hyphenated identifier fragment. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
