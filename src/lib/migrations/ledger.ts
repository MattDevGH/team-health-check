/**
 * Where this project records which migrations it has applied.
 *
 * Requirements: Deployment 3.4, 3.8
 *
 * A module of its own, holding one constant, for a reason worth stating: the
 * startup guard needs this name and nothing else from the migration code.
 * Importing it from `apply-migrations.ts` pulled `node:fs` and a
 * `path.resolve(process.cwd(), …)` into the instrumentation bundle — which
 * fails the Edge build outright, and would have undone the tracing fix made
 * the day before.
 *
 * Deliberately not Prisma's `_prisma_migrations`: see `apply-migrations.ts`
 * for why this project keeps its own.
 */
export const LEDGER_TABLE = '_applied_migration';
