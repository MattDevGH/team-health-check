// @vitest-environment node

/**
 * Executable evidence that one email really can belong to several teams.
 *
 * `TeamMember` is unique on `(teamId, name, email)`, so nothing stops the same
 * person existing in two teams — and magic-link sign-in has to resolve an email
 * to exactly one member. The guard in `auth.service` defends against that, and
 * an in-memory fake cannot prove the case it is defending against is real: the
 * fake permits whatever it is written to permit.
 *
 * Only the schema can settle it, so this runs against a real SQLite file with
 * the committed migrations applied.
 *
 * Requirements: Manager Experience 5.1, 5.4
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { PrismaTeamMemberRepository } from '@/lib/repositories/prisma/team-member.repository';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');
const SHARED_EMAIL = 'shared@example.com';

let workDir: string;
let prisma: PrismaClient;
let repo: PrismaTeamMemberRepository;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shared-email-'));
  const file = path.join(workDir, 'test.db');

  // Apply every committed migration, in order, so the constraints under test
  // are the ones production actually has
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

  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
  repo = new PrismaTeamMemberRepository(prisma);

  const now = new Date();
  for (const [id, name] of [
    ['team-a', 'Team A'],
    ['team-b', 'Team B'],
  ]) {
    await prisma.team.create({
      data: { id, name, privacyMode: 'anonymous', timezone: 'UTC', createdAt: now, updatedAt: now },
    });
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe('the same email across two teams', () => {
  it('is accepted by the database, which is why the guard exists', async () => {
    await repo.create({ teamId: 'team-a', name: 'Matt', email: SHARED_EMAIL });

    // The same person, in a colleague's team. If this threw, the guard would be
    // unnecessary — the schema would already prevent the collision.
    await expect(
      repo.create({ teamId: 'team-b', name: 'Matt', email: SHARED_EMAIL }),
    ).resolves.toBeDefined();
  });

  it('gives findAllByEmail every match, where findByEmail gives an arbitrary one', async () => {
    const all = await repo.findAllByEmail(SHARED_EMAIL);

    expect(all).toHaveLength(2);
    expect(all.map(member => member.teamId).sort()).toEqual(['team-a', 'team-b']);

    // The method sign-in used to rely on: it answers, and cannot say that the
    // answer is one of several
    const one = await repo.findByEmail(SHARED_EMAIL);
    expect(one).not.toBeNull();
    expect(all.map(member => member.id)).toContain(one!.id);
  });

  it('returns nothing for an email no member holds', async () => {
    expect(await repo.findAllByEmail('nobody@example.com')).toEqual([]);
  });
});
