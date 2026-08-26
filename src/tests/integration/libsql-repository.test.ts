// @vitest-environment node

/**
 * Executable evidence that the production database path actually works.
 *
 * `src/lib/prisma.ts` selects the libSQL adapter whenever TURSO_DATABASE_URL is
 * set, but until now nothing ran a single query through it — the tests only
 * asserted which client got constructed. Production therefore ran on a code path
 * with no execution coverage at all.
 *
 * `@libsql/client` accepts a local `file:` URL, so the same adapter Turso uses
 * can be exercised against a temporary database with no external account.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.5
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { PrismaTeamRepository } from '@/lib/repositories/prisma/team.repository';
import { PrismaSlackIdentityLinkRepository } from '@/lib/repositories/prisma/slack-identity-link.repository';
import { PrismaNotificationDeliveryRepository } from '@/lib/repositories/prisma/notification-delivery.repository';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

let workDir: string;
let prisma: PrismaClient;

/** Applies every committed migration, in order, through the libSQL client. */
async function applyMigrations(client: ReturnType<typeof createClient>): Promise<string[]> {
  const applied: string[] = [];
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const dir of dirs) {
    const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (!existsSync(file)) continue;
    await client.executeMultiple(readFileSync(file, 'utf8'));
    applied.push(dir);
  }

  return applied;
}

describe('repositories over the libSQL adapter', () => {
  let appliedMigrations: string[] = [];

  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-libsql-'));
    const dbPath = path.join(workDir, 'libsql-test.db').replace(/\\/g, '/');
    const url = `file:${dbPath}`;

    const client = createClient({ url });
    appliedMigrations = await applyMigrations(client);
    client.close();

    // PrismaLibSql takes the libSQL *config* and builds its own client.
    // Handing it an already-constructed client leaves config.url undefined and
    // every query fails with URL_INVALID.
    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    // Windows can still hold the database file briefly after disconnect; a
    // leftover temp directory must not fail the run
    try {
      if (workDir) rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best effort — the OS reclaims the temp directory
    }
  });

  it('applies the committed migrations through the adapter', () => {
    // Guards against silently testing an empty schema
    expect(appliedMigrations.length).toBeGreaterThan(0);
  });

  it('creates, reads, and updates a team', async () => {
    const repository = new PrismaTeamRepository(prisma);

    const created = await repository.create({ name: 'libSQL Team', description: 'created via adapter' });
    expect(created.id).toBeTruthy();

    const found = await repository.findById(created.id);
    expect(found?.name).toBe('libSQL Team');

    const updated = await repository.update(created.id, {
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '17:00',
    });
    expect(updated.slackDeliveryStart).toBe('09:00');

    const reread = await repository.findById(created.id);
    expect(reread?.slackDeliveryEnd).toBe('17:00');
  });

  it('upserts a Slack identity link without duplicating it', async () => {
    const teamRepo = new PrismaTeamRepository(prisma);
    const team = await teamRepo.create({ name: 'libSQL Slack Team' });
    const member = await prisma.teamMember.create({
      data: { teamId: team.id, name: 'Member', email: 'libsql-member@example.invalid' },
    });

    const repository = new PrismaSlackIdentityLinkRepository(prisma);
    await repository.upsertByMemberId(member.id, 'U_FIRST');
    await repository.upsertByMemberId(member.id, 'U_SECOND');

    const link = await repository.findByMemberId(member.id);
    expect(link?.slackUserId).toBe('U_SECOND');
    expect(await prisma.slackIdentityLink.count({ where: { memberId: member.id } })).toBe(1);
  });

  it('enforces the notification delivery claim through the unique constraint', async () => {
    const repository = new PrismaNotificationDeliveryRepository(prisma);
    const claim = { memberId: 'libsql-member', sessionId: 'libsql-session', type: 'closing_reminder' };

    // The duplicate-suppression that prevents repeat reminders depends on the
    // database rejecting the second insert, so it must hold on libSQL too
    await expect(repository.claim(claim)).resolves.toBe(true);
    await expect(repository.claim(claim)).resolves.toBe(false);

    await expect(
      repository.hasDelivered(claim.memberId, claim.sessionId, claim.type),
    ).resolves.toBe(true);
  });

  it('reports no delivery for an unclaimed combination', async () => {
    const repository = new PrismaNotificationDeliveryRepository(prisma);

    await expect(repository.hasDelivered('nobody', 'nothing', 'closing_reminder')).resolves.toBe(false);
  });
});
