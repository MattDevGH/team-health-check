import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma";
import path from "path";

// Resolve the DB path relative to the project root
const dbPath = path.resolve(process.cwd(), "prisma", "dev.db");

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

// Prevent multiple instances of Prisma Client in development (hot reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
