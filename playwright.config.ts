import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { E2E_CRON_SECRET, e2eDatabaseUrl } from './e2e/database';

/**
 * Playwright configuration for e2e and accessibility tests.
 *
 * The suite runs against a disposable database provisioned by the global setup,
 * never `prisma/dev.db`. The web server is given the same DATABASE_URL, so the
 * app under test and the fixtures agree on where data lives.
 *
 * TEST_MODE enables the in-process email capture that lets the sign-in flow be
 * driven without a real inbox. Without it the capture endpoint returns 404 and
 * the affected tests fail rather than skipping.
 *
 * Requirements: 10.1-10.6
 */
const DATABASE_URL = e2eDatabaseUrl();

export default defineConfig({
  testDir: './e2e',
  globalSetup: path.resolve(__dirname, 'e2e/global-setup.ts'),

  // A single SQLite file is shared by the whole run, so tests are serialised
  // rather than racing each other through it
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // The no-skips reporter fails a run containing any skipped test: Playwright
  // otherwise treats a skip as a pass, which is how a suite reports green while
  // proving nothing.
  reporter: process.env.CI
    ? [['html'], ['list'], ['./e2e/no-skips-reporter.ts']]
    : [['html', { open: 'never' }], ['./e2e/no-skips-reporter.ts']],

  use: {
    baseURL: 'http://localhost:3000',
    // Keep a trace for every failure in CI, not only retried ones, so a
    // first-attempt failure can still be diagnosed from the artifact
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Always the production build, locally as well as in CI, so both exercise
    // the same artifact. The dev server also emits HMR console errors that the
    // strict fixture would (correctly) fail on. `npm run test:e2e` builds first;
    // CI builds in a separate step.
    command: 'npm run start',
    url: 'http://localhost:3000',
    // Always start a fresh server: a reused one may hold the previous
    // DATABASE_URL and quietly read the wrong database
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL,
      TEST_MODE: 'true',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      CRON_SECRET: E2E_CRON_SECRET,
    },
  },
});
