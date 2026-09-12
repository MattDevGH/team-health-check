import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { resolveSqliteFileUrl } from "@/lib/database-url";

/**
 * Environment-aware Prisma client factory.
 *
 * - When TURSO_DATABASE_URL is set: uses @prisma/adapter-libsql (production/Turso)
 * - Otherwise: uses @prisma/adapter-better-sqlite3 against the file named by
 *   DATABASE_URL, falling back to prisma/dev.db
 *
 * DATABASE_URL must be honoured here, not just by the CLI: an E2E run that
 * points at a disposable database has to be certain the app writes there and
 * never touches the development database.
 *
 * Note: The Turso path uses require() for dynamic loading so that the libSQL packages
 * are only resolved when actually needed (production). This prevents build errors in dev
 * where these packages may not be needed.
 */
export function createPrismaClient(): PrismaClient {
  /**
   * Production must not fall back to a local file.
   *
   * A serverless function has no persistent filesystem: the file does not
   * exist, is not shared between concurrent instances, and is destroyed on the
   * next deploy. Without this the application would start, answer requests and
   * lose every response — a failure that reads as data vanishing rather than
   * as a missing environment variable.
   *
   * Thrown from the factory, which runs at module load, so a process that
   * cannot reach its database fails to boot rather than failing one request at
   * a time.
   *
   * Requirements: Deployment 2.1, 2.3
   */
  if (process.env.NODE_ENV === 'production' && !process.env.TURSO_DATABASE_URL) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. In production this would open a local SQLite file, which a serverless deployment cannot persist: the data would be lost on the next deploy and would not be shared between instances. Set TURSO_DATABASE_URL to the production database.',
    );
  }

  if (process.env.TURSO_DATABASE_URL) {
    // Production: Turso via libSQL adapter.
    //
    // PrismaLibSql takes the libSQL *config* and constructs its own client.
    // Passing an already-created client leaves its config.url undefined, and
    // every query then fails with URL_INVALID — see the libSQL repository
    // integration test, which executes this path against a local file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require("@prisma/adapter-libsql");

    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    return new PrismaClient({ adapter });
  }

  // Local SQLite via better-sqlite3, at the configured path
  const adapter = new PrismaBetterSqlite3({ url: resolveSqliteFileUrl() });
  return new PrismaClient({ adapter });
}

// Prevent multiple instances of Prisma Client in development (hot reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
