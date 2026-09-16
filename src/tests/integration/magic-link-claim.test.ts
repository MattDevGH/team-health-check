// @vitest-environment node

/**
 * One claim wins, against a real database.
 *
 * Requirements: Slack Sign In 1.2, 1.4
 * Properties: 2 (single use)
 *
 * `atomic-claims.test.ts` covers this over in-memory repositories and says so
 * in its own header: *"Uses in-memory repositories which simulate CAS via
 * JavaScript's single-threaded nature. Real SQLite row-locking tests in Task
 * 18.x."* Those tests were never written.
 *
 * That matters more now. A magic link used to arrive in an inbox; it now also
 * arrives in Slack, where a link sits in message history and is far easier to
 * open twice — by a double tap, by a preview fetch, by somebody scrolling back.
 * Single-use is the whole of its value, and until this file the guarantee was
 * only ever asserted against a JavaScript `Map`.
 *
 * `claimToken` is an `updateMany` filtered on `used: false` — a compare-and-set
 * that the database, not the application, decides. Only a database can say
 * whether it holds.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { PrismaMagicLinkRepository } from '@/lib/repositories/prisma/magic-link.repository';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');
const CONCURRENCY = 8;

let workDir: string;
let prisma: PrismaClient;
let repository: PrismaMagicLinkRepository;

/*
 * Real members, because `MagicLink.memberId` is a foreign key.
 *
 * The in-memory fake has no such constraint and accepts `'member-1'` happily,
 * which is one more way it agrees with code the database would reject — and
 * one more argument for this file existing.
 */
let memberOne = '';
let memberTwo = '';

async function applyMigrations(client: ReturnType<typeof createClient>): Promise<number> {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  let applied = 0;
  for (const dir of dirs) {
    const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!existsSync(file)) continue;
    await client.executeMultiple(readFileSync(file, 'utf8'));
    applied += 1;
  }
  return applied;
}

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'thc-claim-'));
  const dbPath = path.join(workDir, 'claim-test.db').replace(/\\/g, '/');
  const url = `file:${dbPath}`;

  const client = createClient({ url });
  await applyMigrations(client);
  client.close();

  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  repository = new PrismaMagicLinkRepository(prisma);

  const team = await prisma.team.create({ data: { name: 'Claim Team' } });
  const [one, two] = await Promise.all([
    prisma.teamMember.create({
      data: { teamId: team.id, name: 'One', email: 'one@claim.invalid' },
    }),
    prisma.teamMember.create({
      data: { teamId: team.id, name: 'Two', email: 'two@claim.invalid' },
    }),
  ]);
  memberOne = one.id;
  memberTwo = two.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  try {
    if (workDir) rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // best effort — the OS reclaims the temp directory
  }
});

beforeEach(async () => {
  await prisma.magicLink.deleteMany();
});

const anHourAway = () => new Date(Date.now() + 60 * 60 * 1000);

describe('claiming a sign-in token', () => {
  it('succeeds once', async () => {
    await repository.create({ token: 'once', memberId: memberOne, expiresAt: anHourAway() });

    await expect(repository.claimToken('once')).resolves.toMatchObject({ memberId: memberOne });
  });

  it('refuses the second attempt', async () => {
    await repository.create({ token: 'twice', memberId: memberOne, expiresAt: anHourAway() });
    await repository.claimToken('twice');

    await expect(repository.claimToken('twice')).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    await repository.create({
      token: 'stale',
      memberId: memberOne,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(repository.claimToken('stale')).resolves.toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    await expect(repository.claimToken('invented')).resolves.toBeNull();
  });

  it('lets exactly one of several simultaneous claims through', async () => {
    /*
     * The assertion this file exists for, and the one an in-memory fake cannot
     * make: JavaScript's single thread means a `Map`-backed claim is atomic for
     * free, so the fake agrees with the guarantee whether or not the database
     * does.
     *
     * Eight at once, all awaited together. Anything but exactly one winner is
     * a credential that can be spent twice.
     */
    await repository.create({ token: 'race', memberId: memberOne, expiresAt: anHourAway() });

    const outcomes = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => repository.claimToken('race')),
    );

    expect(outcomes.filter(result => result !== null)).toHaveLength(1);
  });

  it('marks the row used, so the refusal survives a restart', async () => {
    // The refusal must be a fact in the database rather than state held by the
    // process that issued it
    await repository.create({ token: 'durable', memberId: memberOne, expiresAt: anHourAway() });
    await repository.claimToken('durable');

    const row = await prisma.magicLink.findUnique({ where: { token: 'durable' } });
    expect(row?.used).toBe(true);
  });

  it('leaves other tokens alone', async () => {
    // A claim that matched too broadly would spend every outstanding link the
    // moment anybody signed in
    await repository.create({ token: 'mine', memberId: memberOne, expiresAt: anHourAway() });
    await repository.create({ token: 'yours', memberId: memberTwo, expiresAt: anHourAway() });

    await repository.claimToken('mine');

    await expect(repository.claimToken('yours')).resolves.toMatchObject({ memberId: memberTwo });
  });
});
