/**
 * Resolves which SQLite file the application opens.
 *
 * Shared by the Prisma runtime and `prisma.config.ts` so the CLI and the app
 * never disagree about the target database. Relative paths are resolved from the
 * project root rather than the schema directory, which is the usual source of
 * "the migration went somewhere else" confusion.
 *
 * Requirements: Integration 10.2, 10.5, 10.6, 13.5
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


/**
 * Prisma commands that never open a database.
 *
 * `generate` reads the schema and writes a client. `format` and `validate`
 * read the schema. `version` reads nothing. None of them can be fooled into
 * migrating the wrong database, which is the only thing the guard below exists
 * to prevent.
 */
const SCHEMA_ONLY_COMMANDS = new Set(['generate', 'format', 'validate', 'version']);

/**
 * Whether the Prisma command being run would connect to the datasource.
 *
 * An allowlist, not a blocklist, so a Prisma command nobody anticipated is
 * treated as dangerous rather than quietly permitted. Being wrong in that
 * direction costs a loud error; the other direction costs a migration applied
 * to a database nobody meant to touch.
 *
 * Takes argv so the rule can be exercised directly.
 */
export function cliCommandConnectsToDatabase(argv: string[]): boolean {
  // Skip the node binary, the script path, and any leading flags
  const command = argv.slice(2).find(arg => !arg.startsWith('-'));

  if (command === undefined) return true;

  return !SCHEMA_ONLY_COMMANDS.has(command);
}

/**
 * The datasource the Prisma CLI is permitted to use.
 *
 * `prisma migrate deploy` cannot target Turso and cannot be made to: Prisma's
 * `Datasource` config accepts only a url string, this schema's provider is
 * `sqlite`, and Prisma's own documentation directs Turso users to generate SQL
 * and apply it with other tooling.
 *
 * The danger was never that limitation. It was that `prisma.config.ts` resolved
 * its url through `resolveSqliteFileUrl()`, which ignores TURSO_DATABASE_URL and
 * returns a local path — so running the CLI with production credentials in the
 * environment migrated a local file and exited zero, reporting success for work
 * it had not done.
 *
 * Refusing is therefore the safe answer, and the message names the way forward
 * so nobody has to go looking for it.
 *
 * Truthiness matches `createPrismaClient`, deliberately: if the two disagreed
 * about what counts as configured, one would refuse while the other opened a
 * local file.
 *
 * Requirements: Deployment 3.1, 3.2
 */
export function resolveCliDatasourceUrl(): string {
  if (process.env.TURSO_DATABASE_URL && cliCommandConnectsToDatabase(process.argv)) {
    throw new Error(
      'TURSO_DATABASE_URL is set, and the Prisma CLI cannot reach a Turso database — ' +
        'its datasource takes a plain url and this schema targets sqlite. Left to resolve, ' +
        'it would migrate a local file and report success. Run scripts/migrate-production.ts ' +
        'to apply migrations to Turso, or unset TURSO_DATABASE_URL to work locally.',
    );
  }

  return resolveSqliteFileUrl();
}
