import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma';
import { resolveSqliteFileUrl } from '../src/lib/database-url';

/** The fixed question set (Requirement 9.1). */
export const QUESTIONS = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well is the team delivering value to users and stakeholders?', displayOrder: 1 },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How effectively does the team work together and support each other?', displayOrder: 2 },
  { id: 'q-ease-of-delivery', title: 'Ease of Delivery', description: 'How easy is it to get work done without unnecessary blockers or friction?', displayOrder: 3 },
  { id: 'q-learning-improving', title: 'Learning and Improving', description: 'How well does the team learn from experience and continuously improve?', displayOrder: 4 },
  { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe do team members feel to speak up, take risks, and be vulnerable?', displayOrder: 5 },
];

/**
 * Seeds the canonical questions. Idempotent, so it is safe on an existing
 * database as well as a freshly migrated one.
 *
 * Exported so the Playwright global setup can seed its disposable database
 * in-process, rather than spawning this file as a child process — Node 24
 * refuses to spawn Windows `.cmd` shims without a shell.
 */
export async function seedQuestions(client: PrismaClient): Promise<number> {
  for (const question of QUESTIONS) {
    await client.question.upsert({
      where: { id: question.id },
      update: question,
      create: question,
    });
  }

  return QUESTIONS.length;
}

/** Client for the database named by DATABASE_URL, falling back to prisma/dev.db. */
export function createSeedClient(): { client: PrismaClient; databaseUrl: string } {
  const databaseUrl = resolveSqliteFileUrl();
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });

  return { client, databaseUrl };
}

async function main(): Promise<void> {
  const { client, databaseUrl } = createSeedClient();

  try {
    const count = await seedQuestions(client);
    console.log(`Seeded ${count} fixed questions into ${databaseUrl}`);
  } finally {
    await client.$disconnect();
  }
}

// Only run when invoked directly (`prisma db seed` / `npx tsx prisma/seed.ts`),
// not when imported for its exports
if (process.argv[1] && process.argv[1].includes('seed')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
