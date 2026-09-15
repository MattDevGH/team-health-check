/**
 * The navigation shell in a real browser.
 *
 * Requirements: Manager Experience 1.1, 1.2, 1.4, 1.5, 1.6, 1.7
 *
 * jsdom never composes Next.js layouts: a page test renders the page component
 * alone, so "this route has no navigation" is unprovable there — it would pass
 * whether or not a layout wraps the route in production. This is the only tier
 * where the mounting is real.
 *
 * It is also the only tier that can see a skip link move focus, a viewport
 * overflow, or a session revoked in the database behind a click.
 */

import { allowConsoleErrors, test, expect } from './fixtures';
import { countUserSessions, seedAuditEntry, seedMember, seedSession, seedTeam } from './db';
import { signIn } from './sign-in';

/**
 * One member per test. Magic links are rate-limited to five per email per
 * hour, so a shared member runs out partway through a run — and a CI retry
 * spends three of the five on its own. The failure surfaces as a hang on the
 * verification page, nowhere near its cause.
 */
const MEMBER_KEYS = [
  'dashboard',
  'settings',
  'profile',
  'navigate',
  'audit-log',
  'skip-link',
  'focus-order',
  'sign-out',
  'overflow',
  'reachable',
] as const;

type MemberKey = (typeof MEMBER_KEYS)[number];

const emailFor = (key: string) => `nav-${key}@e2e.invalid`;

let teamId = '';
let sessionToken = '';
const memberIds: Partial<Record<MemberKey, string>> = {};

test.beforeAll(() => {
  const team = seedTeam({ teamName: 'Navigation Team', memberEmail: emailFor('owner') });
  teamId = team.teamId;

  sessionToken = seedSession({
    teamId: team.teamId,
    memberId: team.memberId,
    status: 'open',
  }).token;

  for (const key of MEMBER_KEYS) {
    memberIds[key] = seedMember({ teamId: team.teamId, email: emailFor(key) }).memberId;
  }
});

test.describe('the shell is mounted on authenticated routes', () => {
  for (const [name, path] of [
    ['dashboard', () => `/teams/${teamId}/dashboard`],
    ['settings', () => `/teams/${teamId}/settings`],
    ['profile', () => '/me'],
  ] as const) {
    test(`${name} carries the navigation shell and exactly one main landmark`, async ({ page }) => {
      await signIn(page, emailFor(name satisfies MemberKey));
      await page.goto(path());

      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

      // Two main landmarks would leave the skip link pointing at a wrapper and
      // give a screen reader two "main content" targets to choose between
      await expect(page.locator('main')).toHaveCount(1);
    });
  }
});

test.describe('the shell is absent from unauthenticated routes', () => {
  test('the home page has no navigation', async ({ page }) => {
    /*
     * A 401 here is the server answering correctly, not a failure.
     *
     * The landing page asks /api/me whether the visitor is already signed in,
     * so it can send a member to their dashboard rather than offering them a
     * sign-in button they do not need. For an anonymous visitor the honest
     * answer is 401, and the browser logs every 4xx. Keeping the page static
     * and cacheable is worth one expected rejection; the alternative is a
     * server render and a database read on every visit to a public page.
     *
     * Scoped to this test rather than added to the global allowlist, so a real
     * 401 anywhere else still fails the run.
     */
    allowConsoleErrors(page, /401/);

    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('the sign-in page has no navigation', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /request access link/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('a member answering through a session link gets no navigation', async ({ page }) => {
    // A session link authenticates for one session. Offering team destinations
    // here would invite someone into pages the link was never meant to open.
    await page.goto(`/session/${sessionToken}`);
    await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });
});

test.describe('using the shell', () => {
  test('moves between destinations and marks the one it lands on', async ({ page }) => {
    await signIn(page, emailFor('navigate'));
    await page.goto(`/teams/${teamId}/dashboard`);

    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('link', { name: 'Settings' }).click();

    await expect(page).toHaveURL(`/teams/${teamId}/settings`);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the skip link is reachable by keyboard and moves focus to the content', async ({ page }) => {
    await signIn(page, emailFor('skip-link'));
    await page.goto(`/teams/${teamId}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();
    // sr-only until focused: a skip link nobody can see is a skip link nobody uses
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');

    // The proof a skip link works is where focus ends up, not that the URL
    // gained a fragment
    await expect(page.locator('main')).toBeFocused();
  });

  test('reaches a working audit log from the nav', async ({ page }) => {
    // Every destination the shell offers has to survive being followed. This
    // page crashed on a response-shape mismatch that every unit test missed:
    // the route returned a bare array while the page destructured
    // `data.entries`, which on an array is `Array.prototype.entries` — a
    // function, which React's setState then called as a state updater.
    // Only loading the real page against the real route catches that.
    seedAuditEntry({
      teamId,
      userId: memberIds['audit-log']!,
      changeType: 'privacy_mode_changed',
      previousValue: 'attributed',
      newValue: 'anonymous',
    });

    await signIn(page, emailFor('audit-log'));
    await page.goto(`/teams/${teamId}/dashboard`);

    await page.getByRole('link', { name: 'Audit log' }).click();

    await expect(page).toHaveURL(`/teams/${teamId}/audit-log`);
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible();
    await expect(page.getByText('privacy_mode_changed')).toBeVisible();
    await expect(page.getByText(/no audit log entries/i)).toHaveCount(0);

    // The entry was seeded against this member, so the log should recognise
    // them rather than printing the id it stores
    const entry = page.getByRole('article').first();
    await expect(entry).toContainText('Changed by: You');
    await expect(entry, 'a raw member id must never reach the page').not.toContainText(
      memberIds['audit-log']!,
    );
  });

  /**
 * A schedule change, as a person reads it.
   *
   * Raised against the production log, which showed
   * `{"cadence":"weekly","openDay":1,…}` in the After state. Everything else on
   * the card had been made to read like English; this had not.
   *
   * In a browser because the unit tests know the formatter returns the right
   * strings, not that they reach the page a manager opens.
   */
  test('reads a stored schedule back in words, not JSON', async ({ page }) => {
    seedAuditEntry({
      teamId,
      userId: memberIds['audit-log']!,
      changeType: 'schedule_change',
      previousValue: 'null',
      newValue:
        '{"cadence":"weekly","openDay":1,"openTime":"15:30","closeDay":5,"closeTime":"17:00","timezone":"Europe/London"}',
    });

    await signIn(page, emailFor('audit-log'));
    await page.goto(`/teams/${teamId}/audit-log`);

    const entry = page
      .getByRole('article')
      .filter({ hasText: /schedule_change/ })
      .first();

    await expect(entry).toContainText(/opens/i);
    await expect(entry).toContainText(/monday at 15:30/i);
    await expect(entry).toContainText(/friday at 17:00/i);
    await expect(entry).toContainText(/no previous value/i);

    // The complaint in full: no braces, no quotes, no field names
    await expect(entry).not.toContainText('{');
    await expect(entry).not.toContainText(/openDay|closeTime|timezone/);
  });

  test('puts the shell in a sensible tab order before the page content', async ({ page }) => {
    // Axe cannot judge focus order — it is one of the things an automated pass
    // structurally misses, and the reason a manual keyboard check is still
    // required. Recording the actual order at least makes a regression visible.
    await signIn(page, emailFor('focus-order'));
    await page.goto(`/teams/${teamId}/dashboard`);

    // Wait for a team-scoped link, not merely the landmark. The shell renders
    // the landmark with Profile alone while /api/me is in flight, so waiting on
    // the landmark tabs through a half-built nav and asserts the wrong order.
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    const order: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return '(none)';
          return (el.textContent ?? '').trim() || el.tagName.toLowerCase();
        }),
      );
    }

    expect(order).toEqual([
      'Skip to main content',
      // First in the nav because it is the thing the tool is for, and because
      // a contributor never visits the dashboard
      'Health check',
      'Dashboard',
      'Settings',
      'Audit log',
      'Profile',
      'Sign out',
    ]);
  });

  test('signs the member out and revokes the session in the database', async ({ page }) => {
    // Signing out lands on the public homepage, which probes /api/me and is
    // told 401 — see the note on the home-page test above.
    allowConsoleErrors(page, /401/);

    const email = emailFor('sign-out');
    await signIn(page, email);
    await page.goto('/me');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    expect(countUserSessions(email), 'a session should exist before signing out').toBeGreaterThan(0);

    await page.getByRole('button', { name: /sign out/i }).click();

    await expect(page).toHaveURL('/');

    // The cookie being gone only proves the browser was told to drop it. The
    // session row being gone proves the token can no longer authenticate.
    expect(countUserSessions(email), 'the session should be revoked server-side').toBe(0);

    const cookies = await page.context().cookies();
    expect(cookies.find(cookie => cookie.name === 'session')?.value ?? '').toBe('');
  });
});

test.describe('narrow viewports', () => {
  test('the dashboard does not scroll sideways at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, emailFor('overflow'));
    await page.goto(`/teams/${teamId}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, 'horizontal overflow in CSS pixels').toBeLessThanOrEqual(0);
  });

  test('every destination stays reachable at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, emailFor('reachable'));
    await page.goto('/me');

    for (const label of ['Dashboard', 'Settings', 'Audit log', 'Profile']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });
});

/**
 * A member can reach their own health check.
 *
 * Requirements: Reaching Your Health Check 1.1, 1.2, 1.5
 *
 * Production opened a check on 2026-09-14 and nobody could answer it. Nothing
 * in the authenticated interface linked to a session, and this suite could not
 * have noticed: `journey.spec.ts` reaches sessions by reading the token out of
 * the database, which is the same navigating-by-looked-up-URLs pattern that hid
 * the sign-in dead end.
 *
 * So this one clicks.
 */
test.describe('reaching your own health check', () => {
  const EMAIL = 'reach-check@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const team = seedTeam({ teamName: 'Reach Check Team', memberEmail: EMAIL });
    teamId = team.teamId;
  });

  test('offers the health check in the navigation, before any team is known', async ({ page }) => {
    await signIn(page, EMAIL);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: /health check/i })).toBeVisible();
  });

  test('says nothing is open when nothing is', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /health check/i }).click();

    await expect(page.getByText(/no health check is open/i)).toBeVisible();
  });

  test('reaches the answering form by clicking, with no token looked up anywhere', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    // Open a check through the interface, the way a manager would
    await page.getByRole('button', { name: /open a health check/i }).click();
    await expect(page.getByRole('link', { name: /answer the health check/i })).toBeVisible();

    await page.getByRole('link', { name: /answer the health check/i }).click();
    await expect(page).toHaveURL(/\/me\/health-check$/);

    await page.getByRole('link', { name: /answer the health check/i }).click();

    // The feedback form itself — reached entirely by clicking
    await expect(page).toHaveURL(/\/session\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /health check/i }).first()).toBeVisible();
  });

  /**
   * Requirements: Explaining Itself 2.1, 2.2, 2.3, 2.4, 2.5
   *
   * Answering used to end in a receipt with nowhere to go, and a button whose
   * words never changed. Only a browser proves a member is not stranded: the
   * unit tests know the link renders, not that it leads anywhere.
   */
  test('answering ends somewhere, and says the answers can still change', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /health check/i }).click();
    await page.getByRole('link', { name: /answer the health check/i }).click();

    // Answer every question on the form
    /*
      Every question, scored.

      The count is asserted first because `all()` does not wait: called before
      the form has rendered it returns an empty list, and a loop over nothing
      passes silently — which is how the first version of this test reached a
      validation error while claiming to have answered everything.

      The radio inputs are sr-only, so the wrapping label is both the visible
      control and what a real user clicks.
    */
    const scores = page.getByRole('radiogroup');
    await expect(scores).toHaveCount(5);
    for (const group of await scores.all()) {
      await group.locator('label').filter({ hasText: /^4$/ }).click();
    }
    await page.getByRole('button', { name: /^submit responses$/i }).click();

    const confirmation = page.getByRole('status');
    await expect(confirmation).toContainText(/saved/i);
    await expect(confirmation).toContainText(/until this health check closes/i);

    // The form is still there, and the control now says which thing it does
    await expect(page.getByRole('button', { name: /^update responses$/i })).toBeVisible();

    // Pressing it again is harmless, and says so
    await page.getByRole('button', { name: /^update responses$/i }).click();
    await expect(confirmation).toContainText(/no changes/i);

    // And there is a door back into the application
    await confirmation.getByRole('link', { name: /health check/i }).click();
    await expect(page).toHaveURL(/\/me\/health-check$/);
  });

  /**
   * Requirements: Explaining Itself 2.3
   *
   * Written first as "a member holding only a session link is offered no door
   * they cannot open", and it was wrong about the product. Opening a session
   * link establishes a session for that member until the check closes —
   * `/api/auth/session-link/[token]` sets the cookie — so there is no audience
   * that reaches this confirmation signed in to nothing. The spec assumed one,
   * and so did the first version of this test, which then passed by racing the
   * request it should have been waiting for.
   *
   * What matters is the same either way: the door leads somewhere.
   */
  test('a member who arrived on a session link alone can still get into the app', async ({ page, context }) => {
    await signIn(page, EMAIL);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /health check/i }).click();
    await page.getByRole('link', { name: /answer the health check/i }).click();
    const formUrl = page.url();

    // Drop the sign-in: now the link is all they hold, as it is for someone
    // who followed a prompt on a device that has never seen this application
    await context.clearCookies();
    await page.goto(formUrl);

    const scores = page.getByRole('radiogroup');
    await expect(scores).toHaveCount(5);
    for (const group of await scores.all()) {
      await group.locator('label').filter({ hasText: /^3$/ }).click();
    }
    await page.getByRole('button', { name: /responses$/i }).click();

    const confirmation = page.getByRole('status');
    await expect(confirmation).toContainText(/saved/i);

    await confirmation.getByRole('link', { name: /health check/i }).click();
    await expect(page).toHaveURL(/\/me\/health-check$/);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });});
