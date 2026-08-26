/**
 * Location of the disposable E2E database.
 *
 * Shared by the Playwright global setup, the config that passes DATABASE_URL to
 * the web server, and any test that needs to read state directly — so there is
 * exactly one definition of where E2E data lives.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import path from 'node:path';

/** Project-root-relative path. Gitignored; recreated on every run. */
export const E2E_DATABASE_FILE = 'prisma/e2e.db';

/** Absolute `file:` URL for DATABASE_URL. */
export function e2eDatabaseUrl(): string {
  const absolute = path.resolve(__dirname, '..', E2E_DATABASE_FILE);
  return `file:${absolute.replace(/\\/g, '/')}`;
}
