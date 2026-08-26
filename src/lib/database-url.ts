/**
 * Resolves which SQLite file the application opens.
 *
 * Shared by the Prisma runtime and `prisma.config.ts` so the CLI and the app
 * never disagree about the target database. Relative paths are resolved from the
 * project root rather than the schema directory, which is the usual source of
 * "the migration went somewhere else" confusion.
 *
 * Requirements: 10.2, 10.5, 10.6, 13.5
 */

import path from 'node:path';

/** Database used when nothing is configured. */
export const DEFAULT_SQLITE_PATH = ['prisma', 'dev.db'] as const;

/**
 * Turns a DATABASE_URL value into an absolute `file:` URL.
 *
 * Accepts `file:./x.db`, `file:x.db`, a bare path, or an absolute path. An
 * unset or blank value falls back to the development database.
 */
export function resolveSqliteFileUrl(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): string {
  const configured = databaseUrl?.trim();

  const target =
    configured && configured.length > 0
      ? configured.replace(/^file:/, '')
      : path.join(...DEFAULT_SQLITE_PATH);

  const absolute = path.resolve(process.cwd(), target);

  // Forward slashes keep the URL valid on Windows
  return `file:${absolute.replace(/\\/g, '/')}`;
}
