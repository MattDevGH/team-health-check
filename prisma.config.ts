import { defineConfig } from "prisma/config";

import { resolveSqliteFileUrl } from "./src/lib/database-url";

/**
 * Prisma CLI configuration.
 *
 * The datasource URL is resolved with the same helper the runtime uses, so
 * `prisma migrate` and the application always target the same file. Previously
 * the CLI was pinned to prisma/dev.db while the runtime hardcoded it too, which
 * meant `DATABASE_URL=file:./test.db` was honoured by neither.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveSqliteFileUrl(),
  },
});
