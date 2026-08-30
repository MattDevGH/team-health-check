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

import { test, expect } from './fixtures';
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
    for (let i = 0; i < 6; i += 1) {
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
      'Dashboard',
      'Settings',
      'Audit log',
      'Profile',
      'Sign out',
    ]);
  });

  test('signs the member out and revokes the session in the database', async ({ page }) => {
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
