/**
 * Seeding the fixed question catalogue into a production-shaped database.
 *
 * Requirements: Deployment 3.7
 *
 * Two things needed proving, neither of which any existing test covered.
 *
 * That seeding is safe to repeat: the catalogue is reference data the
 * application cannot work without, so it will be run on a fresh database and
 * again after later migrations. `seedQuestions` upserts, which *looks*
 * idempotent — but "looks idempotent" is how this project has been wrong before,
 * and duplicated questions would corrupt every aggregate silently rather than
 * failing.
 *
 * And that it works through the **libSQL adapter**, not merely through
 * better-sqlite3. `createSeedClient` builds a better-sqlite3 client, so the
 * production path had no coverage at all — the same gap that left the Turso
 * adapter broken through six passing tests.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createClient, type Client } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma';
import { applyMigrations } from '@/lib/migrations/apply-migrations';
import { QUESTIONS, seedQuestions } from '../../../prisma/seed';

let workDir: string;
let raw: Client;
let prisma: PrismaClient;

describe('seeding through the production adapter', () => {
  beforeEach(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'thc-seed-'));
    const file = path.join(workDir, 'seed.db').replace(/\\/g, '/');
    const url = `file:${file}`;

    raw = createClient({ url });
    await applyMigrations(raw);

    // The adapter production uses, not the one the seed script builds
    prisma = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  }, 60_000);

  afterEach(async () => {
    await prisma?.$disconnect();
    raw?.close();
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows file locks; a leftover temp dir must not fail a run
    }
  });

  it('seeds the catalogue through the libSQL adapter', async () => {
    await seedQuestions(prisma);

    const count = await prisma.question.count();
    expect(count).toBe(QUESTIONS.length);
  });

  it('leaves the same number of questions when run twice', async () => {
    // Not five rows and five more. Duplicated questions would not fail
    // anything — they would quietly corrupt every aggregate.
    await seedQuestions(prisma);
    await seedQuestions(prisma);

    expect(await prisma.question.count()).toBe(QUESTIONS.length);
  });

  it('gives every question its text, which the dashboard now shows', async () => {
    await seedQuestions(prisma);

    const questions = await prisma.question.findMany({ orderBy: { displayOrder: 'asc' } });

    expect(questions.map(q => q.id)).toEqual(QUESTIONS.map(q => q.id));
    for (const question of questions) {
      expect(question.description.length).toBeGreaterThan(0);
    }
  });

  it('corrects a question that has drifted, rather than leaving it stale', async () => {
    // Upsert, not insert-if-missing: the catalogue is the source of truth, and a
    // row edited by hand in production should be put back
    await seedQuestions(prisma);
    await prisma.question.update({
      where: { id: QUESTIONS[0].id },
      data: { title: 'Edited by hand' },
    });

    await seedQuestions(prisma);

    const restored = await prisma.question.findUnique({ where: { id: QUESTIONS[0].id } });
    expect(restored?.title).toBe(QUESTIONS[0].title);
  });
});
