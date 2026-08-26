import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

/**
 * Environment-aware Prisma client factory.
 *
 * - When TURSO_DATABASE_URL is set: uses @libsql/client + @prisma/adapter-libsql (production/Turso)
 * - Otherwise: uses @prisma/adapter-better-sqlite3 with local prisma/dev.db (development)
 *
 * Note: The Turso path uses require() for dynamic loading so that the libSQL packages
 * are only resolved when actually needed (production). This prevents build errors in dev
 * where these packages may not be needed.
 */
export function createPrismaClient(): PrismaClient {
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

  // Development: local SQLite file via better-sqlite3
  const dbPath = path.resolve(process.cwd(), "prisma", "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

// Prevent multiple instances of Prisma Client in development (hot reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
