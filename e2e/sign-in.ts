/**
 * Signs a seeded member in through the real magic-link flow.
 *
 * Deliberately not `addCookies`: injecting a session would mean the specs never
 * exercise the authentication they depend on, and Requirement 10.3 rules it out.
 * Requesting a link and following it costs one extra request and keeps every
 * spec running against a genuinely server-issued cookie.
 *
 * Requirements: 10.2, 10.3
 */

import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email: string): Promise<void> {
  const requested = await page.request.post('/api/auth/magic-link/request', {
    data: { email },
  });
  expect(requested.ok(), 'magic link request should be accepted').toBe(true);

  const captured = await page.request.get(
    `/api/test/magic-link?email=${encodeURIComponent(email)}`,
  );
  expect(
    captured.ok(),
    'TEST_MODE magic-link capture must be available — a required scenario must fail, never skip',
  ).toBe(true);

  const { token } = await captured.json();
  await page.goto(`/auth/magic/${token}`);

  /*
   * Signing in must arrive somewhere a person can use.
   *
   * This asserted the bare homepage until 2026-09-11, which was true and
   * useless: / was a marketing page offering "Sign in with magic link", so the
   * assertion passed while a signed-in member stood on an invitation to sign
   * in. Every spec then navigated by a URL it had looked up in the database,
   * so nothing noticed.
   *
   * Waiting for the dashboard keeps this helper honest: it fails if sign-in
   * ever stops delivering people into the app.
   */
  /*
   * The timeout is explicit because the default five seconds is not enough on
   * a loaded CI runner. Verifying a magic link writes a session row and then
   * redirects, and the first request to a route under `next start` pays for
   * loading it. CI failed here on 2026-09-25 while the same commit passed on
   * another runner minutes earlier, and passed locally in under a second.
   */
  await expect(page).toHaveURL(/\/teams\/[^/]+\/dashboard$/, { timeout: 20_000 });

  /*
   * Requirements: Feeling Responsive NFR 1.1, 4.1
   *
   * Reaching the dashboard is not the same as being finished with it.
   * `toHaveURL` resolves when the navigation commits, while that page's own
   * `sessions` and `trends` requests are still in flight — so a test that
   * starts counting requests immediately afterwards can be handed traffic this
   * helper caused.
   *
   * Not hypothetical. `request-budget.spec.ts` recorded three requests in CI —
   * `sessions`, `trends`, `sessions` — against a budget of two, because the
   * leftover `sessions` from signing in arrived after its listener attached.
   * That spec's own header already promised this could not happen: "Counted
   * after sign-in, so the sign-in flow's own traffic is not charged to the page
   * under test." The promise held only while the runner was fast enough.
   *
   * Waiting for quiet here makes it true for every caller, rather than asking
   * each one to remember.
   */
  await page.waitForLoadState('networkidle');

  const cookies = await page.context().cookies();
  expect(
    cookies.find(cookie => cookie.name === 'session'),
    'the server should have set a session cookie',
  ).toBeTruthy();
}
