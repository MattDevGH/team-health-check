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

import { test, expect } from './fixtures';
import { seedSession, seedTeam, type SeededAggregate } from './db';
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
  const SPARSE_EMAIL = 'a11y-sparse@e2e.invalid';
  const RICH_EMAIL = 'a11y-rich@e2e.invalid';
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

    const rich = seedTeam({ teamName: 'A11y Rich Team', memberEmail: RICH_EMAIL });
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
  });

  test('team settings', async ({ page }) => {
    await signIn(page, RICH_EMAIL);
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
    await signIn(page, RICH_EMAIL);
    await page.goto(`/teams/${richTeamId}/dashboard`);
    await expect(page.getByText(/more data needed/i)).toHaveCount(0);

    await expectNoViolations(page, 'populated dashboard');

    // The drill-down is a distinct state: it renders content the collapsed
    // dashboard never shows
    await page.getByRole('button', { name: /delivering value/i }).click();
    await expectNoViolations(page, 'populated dashboard with question expanded');
  });
});
