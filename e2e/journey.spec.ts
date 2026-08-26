/**
 * The authoritative end-to-end journey.
 *
 * Each stage is its own test so a failure localises, and `describe.serial`
 * stops the rest rather than reporting a cascade of confusing errors.
 *
 * The browser drives everything the product exposes a UI for. Session open and
 * close, and the scheduler tick, go through the API because no UI exists for
 * them — session lifecycle management is a deferred milestone, not a shortcut
 * taken here for convenience.
 *
 * Nothing is skipped. If the TEST_MODE capture is unavailable the run fails.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type { Page } from '@playwright/test';

import { test, expect, watchSharedPage } from './fixtures';
import { findTeamByName } from './db';

const EMAIL = 'journey-owner@e2e.invalid';
const TEAM_NAME = 'Journey Team';

/** Carried between stages; `describe.serial` guarantees the ordering. */
const state = {
  teamId: '',
};

test.describe.serial('team lifecycle journey', () => {
  // One browser, one session, carried across every stage. Playwright gives each
  // test a fresh context by default, which would drop the cookie genesis set.
  let page: Page;
  let assertPageClean: () => void;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    assertPageClean = watchSharedPage(page);
  });

  test.afterEach(() => {
    assertPageClean();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('requests a magic link from the login page', async () => {
    await page.goto('/auth/login');

    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: /request access link/i }).click();

    // Anti-enumeration wording: the same regardless of whether the email exists
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
  });

  test('creates the team through the genesis form', async () => {
    const captured = await page.request.get(
      `/api/test/magic-link?email=${encodeURIComponent(EMAIL)}`,
    );
    expect(
      captured.ok(),
      'TEST_MODE magic-link capture must be available — a required scenario must fail, never skip',
    ).toBe(true);

    const { token } = await captured.json();
    expect(token).toBeTruthy();

    await page.goto(`/auth/magic/${token}`);

    await expect(page.getByRole('heading', { name: /create your team/i })).toBeVisible();
    await page.getByLabel('Team name').fill(TEAM_NAME);
    await page.getByRole('button', { name: /create team/i }).click();

    // Genesis returns to the home page once the session is established
    await expect(page).toHaveURL(/\/$/);

    const team = findTeamByName(TEAM_NAME);
    expect(team, 'team should exist in the E2E database').toBeTruthy();
    state.teamId = team!.id;
  });

  test('holds a session cookie set by the server, not injected by the test', async () => {
    const cookies = await page.context().cookies();
    const session = cookies.find(cookie => cookie.name === 'session');

    expect(session, 'the server must set the session cookie during genesis').toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(session!.value.length).toBeGreaterThan(20);

    // And it authenticates a protected endpoint through the browser context
    const me = await page.request.get('/api/me');
    expect(me.ok()).toBe(true);
    expect((await me.json()).teamId).toBe(state.teamId);
  });
});
