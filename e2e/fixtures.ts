/**
 * Strict Playwright fixtures.
 *
 * A browser test can pass while the page is quietly broken — an uncaught
 * exception, a failed asset, a swallowed fetch. Requirement 10.5 asks for those
 * to fail the run, so every test using this `test` export fails if the page
 * raised an uncaught error, logged an unexpected console error, or had a
 * first-party request fail.
 *
 * Import `test` and `expect` from here rather than from @playwright/test.
 *
 * Requirements: 10.1, 10.4, 10.5
 */

import { test as base, expect, type Page, type Request } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

/**
 * Console output permitted to be an error.
 *
 * Keep this list short and justified: every entry is a class of failure the
 * suite can no longer see. Prefer fixing the cause.
 */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [
  // React logs a 404 response body for deliberately-missing resources in some
  // navigations; the assertions cover the user-visible outcome instead.
  /Failed to load resource: the server responded with a status of 404/,
];

/** Aborted requests are usually navigation superseding an in-flight fetch. */
const IGNORED_REQUEST_FAILURES = ['net::ERR_ABORTED'];

function isFirstParty(url: string): boolean {
  return url.startsWith(BASE_URL);
}

interface Collected {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
}

function watch(page: Page): Collected {
  const collected: Collected = { pageErrors: [], consoleErrors: [], failedRequests: [] };

  page.on('pageerror', error => {
    collected.pageErrors.push(error.message);
  });

  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ALLOWED_CONSOLE_ERRORS.some(pattern => pattern.test(text))) return;
    collected.consoleErrors.push(text);
  });

  page.on('requestfailed', (request: Request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    if (!isFirstParty(request.url())) return;
    if (IGNORED_REQUEST_FAILURES.includes(failure)) return;
    collected.failedRequests.push(`${request.method()} ${request.url()} — ${failure}`);
  });

  return collected;
}

function assertClean(collected: Collected): void {
  expect(collected.pageErrors, 'uncaught page errors').toEqual([]);
  expect(collected.consoleErrors, 'unexpected console errors').toEqual([]);
  expect(collected.failedRequests, 'failed first-party requests').toEqual([]);
}

export const test = base.extend({
  // The second argument is Playwright's fixture callback. It is named `run`
  // rather than the conventional `use` so eslint's react-hooks rule does not
  // mistake it for a React hook.
  page: async ({ page }, run) => {
    const collected = watch(page);

    await run(page);

    assertClean(collected);
  },
});

/**
 * Applies the same strictness to a page the test created itself.
 *
 * The journey shares one page across its stages so the session cookie is
 * genuinely carried rather than re-injected — reusing `storageState` would be a
 * form of the cookie injection Requirement 10.3 rules out. Call the returned
 * function after each stage; it reports problems since the previous call, so a
 * failure is attributed to the stage that caused it.
 */
export function watchSharedPage(page: Page): () => void {
  const collected = watch(page);

  return () => {
    assertClean(collected);
    collected.pageErrors.length = 0;
    collected.consoleErrors.length = 0;
    collected.failedRequests.length = 0;
  };
}

export { expect };
