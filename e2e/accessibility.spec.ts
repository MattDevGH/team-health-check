/**
 * Accessibility checks with axe-core in a real browser.
 *
 * Unlike jest-axe in jsdom, this detects colour-contrast violations, because
 * Playwright renders with real computed styles.
 *
 * Coverage is every state a member or manager actually lands on, not just the
 * two unauthenticated pages that were covered before: an accessible login page
 * says nothing about the form people spend their time in.
 *
 * WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text.
 *
 * These checks are necessary but not sufficient for an AA conformance claim.
 * Axe detects roughly a third to a half of WCAG issues; it cannot judge whether
 * alt text is meaningful, whether focus order makes sense, or whether a custom
 * widget traps keyboard users. Those need a manual pass.
 *
 * Requirements: 10.1, 10.4; Original NFR accessibility criteria
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { allowConsoleErrors, test, expect } from './fixtures';
import { seedMember, seedSession, seedTeam, type SeededAggregate } from './db';
import { signIn } from './sign-in';

/**
 * WCAG 2.1 Level A and AA.
 *
 * The 2.1 tags matter: they carry every criterion added after 2.0, including
 * reflow (1.4.10), non-text contrast (1.4.11), text spacing (1.4.12), content
 * on hover or focus (1.4.13), and status messages (4.1.3). Asserting only the
 * `wcag2*` tags checks WCAG 2.0 while claiming 2.1.
 */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Asserts a page has no WCAG 2.1 A/AA violations.
 *
 * Failures name the offending element and axe's explanation, because a bare
 * rule id ("color-contrast") tells you nothing about which element to fix.
 */
async function expectNoViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  const findings = results.violations.flatMap(violation =>
    violation.nodes.map(node =>
      `${violation.id} @ ${node.target.join(' ')} — ${node.failureSummary?.replace(/\s+/g, ' ').trim()}`,
    ),
  );

  expect(findings, `accessibility violations on ${context}`).toEqual([]);
}

function aggregate(questionId: string, averageScore: number): SeededAggregate {
  return {
    questionId,
    averageScore,
    responseCount: 5,
    improvingCount: 2,
    stableCount: 2,
    decliningCount: 1,
  };
}

test.describe('unauthenticated pages', () => {
  test('homepage', async ({ page }) => {
    await page.goto('/');
    await expectNoViolations(page, 'homepage');
  });

  test('login page', async ({ page }) => {
    await page.goto('/auth/login');
    await expectNoViolations(page, 'login page');
  });

  test('login page with text typed into the email field', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill('user@example.com');

    // Contrast of entered text, not just the placeholder
    const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).include('input').analyze();
    expect(results.violations.map(v => v.id), 'input contrast violations').toEqual([]);
  });

  test('genesis team-creation form', async ({ page }) => {
    // A brand new address routes the magic link into the genesis flow
    const email = 'a11y-genesis@e2e.invalid';
    const requested = await page.request.post('/api/auth/magic-link/request', { data: { email } });
    expect(requested.ok()).toBe(true);

    const captured = await page.request.get(`/api/test/magic-link?email=${encodeURIComponent(email)}`);
    expect(captured.ok(), 'TEST_MODE capture must be available').toBe(true);
    const { token } = await captured.json();

    await page.goto(`/auth/magic/${token}`);
    await expect(page.getByRole('heading', { name: /create your team/i })).toBeVisible();

    await expectNoViolations(page, 'genesis form');
  });
});

test.describe('feedback states', () => {
  const EMAIL = 'a11y-feedback@e2e.invalid';
  let openToken = '';
  let closedToken = '';

  test.beforeAll(() => {
    const team = seedTeam({ teamName: 'A11y Feedback Team', memberEmail: EMAIL });

    openToken = seedSession({
      teamId: team.teamId,
      memberId: team.memberId,
      index: 0,
      status: 'open',
    }).token;

    closedToken = seedSession({
      teamId: team.teamId,
      memberId: team.memberId,
      index: 1,
      status: 'closed',
      closedAt: new Date('2026-08-01T17:00:00.000Z'),
    }).token;
  });

  test('active feedback form', async ({ page }) => {
    await page.goto(`/session/${openToken}`);
    await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();

    await expectNoViolations(page, 'active feedback form');
  });

  test('submission confirmation', async ({ page }) => {
    await page.goto(`/session/${openToken}`);

    // Every question needs a score: the form rejects a partial submission
    for (const title of [
      'Delivering Value',
      'Team Collaboration',
      'Ease of Delivery',
      'Learning and Improving',
      'Psychological Safety',
    ]) {
      await page
        .getByRole('group', { name: title })
        .getByRole('radiogroup', { name: `${title} score` })
        .locator('label')
        .filter({ hasText: /^4$/ })
        .click();
    }

    await page.getByRole('button', { name: /submit responses/i }).click();
    await expect(page.getByText(/submitted successfully/i)).toBeVisible();

    await expectNoViolations(page, 'submission confirmation');
  });

  test('ended session', async ({ page }) => {
    await page.goto(`/session/${closedToken}`);
    await expect(page.getByRole('heading', { name: /session ended/i })).toBeVisible();

    await expectNoViolations(page, 'ended session');
  });
});

test.describe('authenticated pages', () => {
  /**
   * One member per test that signs in. Magic links are rate-limited to five per
   * email per hour, process-wide, and CI allows two retries — so a single
   * member shared by three tests can exhaust the limit during a bad run and
   * hang on the verification page instead of failing where the fault is.
   */
  const RICH_KEYS = ['settings', 'dashboard', 'profile', 'skip-link', 'sign-out', 'reflow'] as const;
  const SPARSE_EMAIL = 'a11y-sparse@e2e.invalid';
  const richEmail = (key: (typeof RICH_KEYS)[number]) => `a11y-rich-${key}@e2e.invalid`;
  let sparseTeamId = '';
  let richTeamId = '';

  test.beforeAll(() => {
    // One closed session is below the two-session threshold, so the dashboard
    // renders its insufficient-data state
    const sparse = seedTeam({ teamName: 'A11y Sparse Team', memberEmail: SPARSE_EMAIL });
    seedSession({
      teamId: sparse.teamId,
      memberId: sparse.memberId,
      status: 'closed',
      closedAt: new Date('2026-08-03T17:00:00.000Z'),
      aggregates: [aggregate('q-delivering-value', 4)],
    });
    sparseTeamId = sparse.teamId;

    const rich = seedTeam({ teamName: 'A11y Rich Team', memberEmail: richEmail('settings') });
    [new Date('2026-08-10T17:00:00.000Z'), new Date('2026-08-17T17:00:00.000Z')].forEach(
      (closedAt, index) => {
        seedSession({
          teamId: rich.teamId,
          memberId: rich.memberId,
          index,
          status: 'closed',
          closedAt,
          aggregates: [aggregate('q-delivering-value', 4 + index * 0.5)],
        });
      },
    );
    richTeamId = rich.teamId;

    for (const key of RICH_KEYS) {
      if (key === 'settings') continue; // seeded as the team's own member above
      seedMember({ teamId: rich.teamId, email: richEmail(key) });
    }
  });

  test('team settings', async ({ page }) => {
    await signIn(page, richEmail('settings'));
    await page.goto(`/teams/${richTeamId}/settings`);
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();

    await expectNoViolations(page, 'team settings');
  });

  test('dashboard with insufficient data', async ({ page }) => {
    await signIn(page, SPARSE_EMAIL);
    await page.goto(`/teams/${sparseTeamId}/dashboard`);
    await expect(page.getByText(/more data needed/i)).toBeVisible();

    await expectNoViolations(page, 'insufficient dashboard');
  });

  test('populated dashboard, including an expanded question', async ({ page }) => {
    await signIn(page, richEmail('dashboard'));
    await page.goto(`/teams/${richTeamId}/dashboard`);
    await expect(page.getByText(/more data needed/i)).toHaveCount(0);

    await expectNoViolations(page, 'populated dashboard');

    // The drill-down is a distinct state: it renders content the collapsed
    // dashboard never shows
    await page.getByRole('button', { name: /delivering value/i }).click();
    await expectNoViolations(page, 'populated dashboard with question expanded');
  });

  test('profile page', async ({ page }) => {
    // Never audited before this milestone, and now the third page carrying the
    // navigation shell
    await signIn(page, richEmail('profile'));
    await page.goto('/me');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    await expectNoViolations(page, 'profile page');
  });
});

/**
 * The trend chart at the widths a manager actually uses.
 *
 * Requirements: Dashboard Refinement 2.4, 2.5; NFR 1
 *
 * The legend and the data table are the parts that have to survive a narrow
 * viewport — the drawing itself scales, but a five-column table and a
 * five-entry legend do not.
 */
test.describe('the trend chart at narrow widths', () => {
  const CHART = 'a11y-chart@e2e.invalid';
  let chartTeamId = '';

  test.beforeAll(() => {
    const team = seedTeam({ teamName: 'A11y Chart Team', memberEmail: CHART });
    chartTeamId = team.teamId;

    // Two closed sessions with aggregates, so the chart renders in full
    [new Date('2026-08-10T17:00:00.000Z'), new Date('2026-08-17T17:00:00.000Z')].forEach(
      (closedAt, index) => {
        seedSession({
          teamId: team.teamId,
          memberId: team.memberId,
          index,
          status: 'closed',
          closedAt,
          aggregates: [
            aggregate('q-delivering-value', 4 + index * 0.5),
            aggregate('q-psychological-safety', 3 + index * 0.5),
          ],
        });
      },
    );
  });

  test('does not scroll the page sideways at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, CHART);
    await page.goto(`/teams/${chartTeamId}/dashboard`);
    await expect(page.getByRole('figure', { name: /average score per question/i })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow in CSS pixels at 320px').toBeLessThanOrEqual(0);

    await expectNoViolations(page, 'trend chart at 320px');
  });

  test('keeps every legend entry readable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, CHART);
    await page.goto(`/teams/${chartTeamId}/dashboard`);

    const legend = page.getByRole('list', { name: /question themes plotted/i });
    for (const name of ['Delivering Value', 'Psychological Safety']) {
      await expect(legend.getByText(name)).toBeVisible();
    }
  });
});

/**
 * First-run guidance.
 *
 * Requirements: Manager Experience 4.1, 4.3, 4.5; NFR 1
 *
 * The states a brand new team meets, which every other authenticated test
 * deliberately seeds past.
 */
test.describe('first-run guidance', () => {
  const FRESH = 'a11y-guidance-fresh@e2e.invalid';
  let freshTeamId = '';

  test.beforeAll(() => {
    // No members beyond the creator, no schedule, no sessions
    const fresh = seedTeam({ teamName: 'A11y Guidance Team', memberEmail: FRESH });
    freshTeamId = fresh.teamId;
  });

  test('the dashboard of a team that has never run a check', async ({ page }) => {
    await signIn(page, FRESH);
    await page.goto(`/teams/${freshTeamId}/dashboard`);
    await expect(page.getByRole('region', { name: 'Next steps' })).toBeVisible();

    await expectNoViolations(page, 'dashboard with first-run guidance');
  });

  test('the settings page of a team still being set up', async ({ page }) => {
    await signIn(page, FRESH);
    await page.goto(`/teams/${freshTeamId}/settings`);
    await expect(page.getByRole('region', { name: 'Next steps' })).toBeVisible();

    await expectNoViolations(page, 'settings with first-run guidance');
  });
});

/**
 * The lifecycle panel, including the confirmation dialog.
 *
 * The dialog is a distinct state a page-level audit never reaches: it exists
 * only after a click, and it renders in the top layer over an inert page.
 *
 * Requirements: Manager Experience 2.3, 2.4; NFR 1
 */
test.describe('session lifecycle states', () => {
  const COLLECTING = 'a11y-lifecycle-collecting@e2e.invalid';
  const CONFIRMING = 'a11y-lifecycle-confirming@e2e.invalid';
  let collectingTeamId = '';
  let confirmingTeamId = '';

  test.beforeAll(() => {
    const collecting = seedTeam({ teamName: 'A11y Collecting Team', memberEmail: COLLECTING });
    seedSession({ teamId: collecting.teamId, memberId: collecting.memberId, status: 'open' });
    collectingTeamId = collecting.teamId;

    const confirming = seedTeam({ teamName: 'A11y Confirming Team', memberEmail: CONFIRMING });
    seedSession({ teamId: confirming.teamId, memberId: confirming.memberId, status: 'open' });
    confirmingTeamId = confirming.teamId;
  });

  test('the panel while a check is collecting', async ({ page }) => {
    await signIn(page, COLLECTING);
    await page.goto(`/teams/${collectingTeamId}/dashboard`);
    await expect(page.getByRole('region', { name: 'Health check' })).toContainText(
      /collecting responses/i,
    );

    await expectNoViolations(page, 'lifecycle panel while collecting');
  });

  test('the close confirmation dialog', async ({ page }) => {
    await signIn(page, CONFIRMING);
    await page.goto(`/teams/${confirmingTeamId}/dashboard`);

    await page
      .getByRole('region', { name: 'Health check' })
      .getByRole('button', { name: /^close the health check$/i })
      .click();
    await expect(page.getByRole('dialog', { name: /close this health check/i })).toBeVisible();

    await expectNoViolations(page, 'close confirmation dialog');
  });
});

/**
 * States the shell introduces that a page-level audit never reaches.
 *
 * Requirements: Manager Experience 1.2, 1.5, 1.6; NFR 1
 */
test.describe('navigation shell states', () => {
  type ShellKey = 'skip-link' | 'sign-out' | 'reflow';
  const shellEmail = (key: ShellKey) => `a11y-shell-${key}@e2e.invalid`;
  let teamId = '';

  test.beforeAll(() => {
    const team = seedTeam({ teamName: 'A11y Shell Team', memberEmail: shellEmail('skip-link') });
    teamId = team.teamId;
    seedMember({ teamId: team.teamId, email: shellEmail('sign-out') });
    seedMember({ teamId: team.teamId, email: shellEmail('reflow') });
  });

  test('the skip link, once focused and visible', async ({ page }) => {
    await signIn(page, shellEmail('skip-link'));
    await page.goto(`/teams/${teamId}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /skip to main content/i })).toBeVisible();

    // Until it is focused the skip link is clipped to a 1×1 box, which axe
    // treats as hidden and skips. Its contrast is only ever checked here.
    await expectNoViolations(page, 'shell with the skip link focused');
  });

  test('the sign-out failure message', async ({ page }) => {
    await signIn(page, shellEmail('sign-out'));
    await page.goto(`/teams/${teamId}/dashboard`);

    // The one shell state a real server will not produce on demand. Failing the
    // revoke is the only way to render the status message at all, and an
    // unaudited error state is exactly where contrast failures survive.
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 500, body: '{}' }));
    allowConsoleErrors(page, /status of 500 \(Internal Server Error\)/);

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('status')).toContainText(/could not sign you out/i);

    await expectNoViolations(page, 'shell showing the sign-out failure');
  });

  test('reflows to 320px without a horizontal scrollbar', async ({ page }) => {
    // WCAG 2.1 AA 1.4.10 (Reflow) is specified at 320 CSS pixels — the width a
    // 1280px viewport reaches at 400% zoom. The 375px check in the navigation
    // spec is a phone; this is the criterion.
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, shellEmail('reflow'));
    await page.goto(`/teams/${teamId}/dashboard`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow in CSS pixels at 320px').toBeLessThanOrEqual(0);

    await expectNoViolations(page, 'dashboard at 320px');
  });
});
