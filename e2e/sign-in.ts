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

  // The verify page redirects home once the cookie is established
  await expect(page).toHaveURL(/\/$/);

  const cookies = await page.context().cookies();
  expect(
    cookies.find(cookie => cookie.name === 'session'),
    'the server should have set a session cookie',
  ).toBeTruthy();
}
