/**
 * Dashboard rendering, against seeded aggregates.
 *
 * The journey proves the app can produce a populated dashboard through its own
 * flows, so this spec seeds state instead — which is the only way to get
 * response counts above the anonymity threshold and trend distributions a
 * single respondent could never generate.
 *
 * Every displayed figure is compared with the value that was seeded, so a
 * dashboard rendering a confident but wrong number fails.
 *
 * Requirements: 10.1, 10.4, 4.1, 4.2, 14.x (anonymity threshold)
 */

import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { seedClosedSessions, type SeededAggregate } from './db';
import { signIn } from './sign-in';

const OLDER = new Date('2026-08-10T17:00:00.000Z');
const NEWER = new Date('2026-08-17T17:00:00.000Z');

/** Counts sit above the anonymity threshold of 3 so values are displayed. */
function aggregate(overrides: Partial<SeededAggregate> & { questionId: string }): SeededAggregate {
  return {
    averageScore: 4,
    responseCount: 5,
    improvingCount: 0,
    stableCount: 0,
    decliningCount: 0,
    ...overrides,
  };
}

/**
 * Expands a question and returns just its detail region.
 *
 * Scoping matters: the trend chart renders Y-axis labels "1.0" through "5.0",
 * so a page-wide search for a score matches an axis tick and proves nothing.
 *
 * The region is located by its border class because the disclosure has no
 * accessible relationship to its content yet. Adding `aria-controls` is item 3
 * on the deferred dashboard UX list and would give a durable handle here.
 */
async function openQuestionDetail(page: Page, question: RegExp) {
  await page.getByRole('button', { name: question }).click();
  const detail = page.locator('div.border-l-2');
  await expect(detail).toBeVisible();
  return detail;
}

test.describe('dashboard with sufficient responses', () => {
  const EMAIL = 'dashboard-owner@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const seeded = seedClosedSessions({
      teamName: 'Dashboard Fixture Team',
      memberEmail: EMAIL,
      privacyMode: 'anonymous',
      sessions: [
        {
          closedAt: OLDER,
          aggregates: [
            aggregate({ questionId: 'q-delivering-value', averageScore: 3.4, responseCount: 5, improvingCount: 1, stableCount: 3, decliningCount: 1 }),
            aggregate({ questionId: 'q-psychological-safety', averageScore: 2.5, responseCount: 4 }),
          ],
        },
        {
          closedAt: NEWER,
          aggregates: [
            aggregate({ questionId: 'q-delivering-value', averageScore: 4.6, responseCount: 6, improvingCount: 4, stableCount: 1, decliningCount: 1 }),
            aggregate({ questionId: 'q-psychological-safety', averageScore: 3.0, responseCount: 6 }),
          ],
        },
      ],
    });
    teamId = seeded.teamId;
  });

  test('shows trend data rather than the insufficient-data message', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    await expect(page.getByText(/more data needed/i)).toHaveCount(0);
  });

  test('shows each session average and response count exactly as stored', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    const detail = await openQuestionDetail(page, /delivering value/i);

    // One row per session, oldest first. Asserting per row rather than over the
    // whole region proves each average is paired with its own count — and the
    // spans concatenate ("3.4" + "5 responses" reads as "3.45 responses"), so a
    // region-wide match on the number would be meaningless anyway.
    const rows = detail.locator('> div');
    await expect(rows).toHaveCount(2);

    await expect(rows.nth(0)).toContainText('3.4');
    // Counts are asserted by number, not by the surrounding wording:
    // "1 responses" is a known pluralisation defect on the deferred dashboard
    // UX list, and pinning the exact string would cement it.
    await expect(rows.nth(0)).toContainText(/5 responses?/);

    await expect(rows.nth(1)).toContainText('4.6');
    await expect(rows.nth(1)).toContainText(/6 responses?/);
  });

  test('shows the stored trend distribution for the latest session', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    // Seeded 4 improving / 1 stable / 1 declining — a spread no single
    // respondent could produce, which is the point of seeding
    await expect(page.getByText(/Improving:\s*4/)).toBeVisible();
    await expect(page.getByText(/Stable:\s*1/)).toBeVisible();
    await expect(page.getByText(/Declining:\s*1/)).toBeVisible();
  });

  test('does not suppress values when counts reach the anonymity threshold', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    const detail = await openQuestionDetail(page, /psychological safety/i);

    await expect(detail).not.toContainText(/insufficient data/i);
    await expect(detail).toContainText('2.5');
    await expect(detail).toContainText('3.0');
  });
});

test.describe('dashboard below the anonymity threshold', () => {
  const EMAIL = 'dashboard-sparse@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const seeded = seedClosedSessions({
      teamName: 'Sparse Dashboard Team',
      memberEmail: EMAIL,
      privacyMode: 'anonymous',
      sessions: [
        { closedAt: OLDER, aggregates: [aggregate({ questionId: 'q-delivering-value', averageScore: 4.0, responseCount: 2 })] },
        { closedAt: NEWER, aggregates: [aggregate({ questionId: 'q-delivering-value', averageScore: 5.0, responseCount: 2 })] },
      ],
    });
    teamId = seeded.teamId;
  });

  test('hides per-session scores when too few people responded', async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    const detail = await openQuestionDetail(page, /delivering value/i);

    await expect(detail).toContainText(/insufficient data/i);
    // Scoped to the detail region: "4.0" and "5.0" also appear as chart axis labels
    await expect(detail).not.toContainText('4.0');
    await expect(detail).not.toContainText('5.0');
  });
});
