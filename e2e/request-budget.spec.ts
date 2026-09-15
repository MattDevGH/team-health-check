/**
 * How many times a page load asks the server.
 *
 * Requirements: Feeling Responsive 4.1, 1.1, NFR 1.1
 *
 * The application was slow because a dashboard load made four requests whose
 * queries were sequential, and nothing in the suite could say so. Only a browser
 * makes the requests a browser makes, so the count lives here.
 *
 * Counted after sign-in, so the sign-in flow's own traffic is not charged to the
 * page under test.
 */

import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { seedClosedSessions, type SeededAggregate } from './db';
import { signIn } from './sign-in';

const OLDER = new Date('2026-08-10T17:00:00.000Z');
const NEWER = new Date('2026-08-17T17:00:00.000Z');

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
 * Loads a page and returns the API requests it made.
 *
 * `networkidle` rather than a fixed wait: the requests under test are made by
 * effects that run after hydration, and a timeout long enough to be safe on a
 * loaded CI machine would make every run of this spec slow.
 */
async function apiRequestsDuring(page: Page, load: () => Promise<unknown>): Promise<string[]> {
  const requests: string[] = [];

  const record = (url: string) => {
    const { pathname } = new URL(url);
    if (pathname.startsWith('/api/')) requests.push(pathname);
  };

  page.on('request', request => record(request.url()));

  try {
    await load();
    await page.waitForLoadState('networkidle');
  } finally {
    page.removeAllListeners('request');
  }

  return requests;
}

test.describe('what a dashboard load asks for', () => {
  const EMAIL = 'request-budget@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const seeded = seedClosedSessions({
      teamName: 'Request Budget Team',
      memberEmail: EMAIL,
      privacyMode: 'attributed',
      sessions: [
        { closedAt: OLDER, aggregates: [aggregate({ questionId: 'q-delivering-value', averageScore: 3.4 })] },
        { closedAt: NEWER, aggregates: [aggregate({ questionId: 'q-delivering-value', averageScore: 4.2 })] },
      ],
    });
    teamId = seeded.teamId;
  });

  test('loads the dashboard with data, so the count is of a real load', async ({ page }) => {
    // A dashboard that errored would make fewer requests and pass every budget
    await signIn(page, EMAIL);
    await page.goto(`/teams/${teamId}/dashboard`);

    await expect(page.getByRole('region', { name: /latest session/i })).toBeVisible();
  });

  test('makes at most 2 API requests', async ({ page }) => {
    /*
     * Was four: `/api/me`, `/api/me` again, the trends, and the session
     * lifecycle panel. Both identity requests are gone — the layout resolves
     * the member on the server — leaving the two that fetch what the page
     * actually renders.
     *
     * NFR 1.1's number, reached rather than aimed at. It stays a ratchet: the
     * next request added to this page has to be a decision.
     */
    await signIn(page, EMAIL);

    const requests = await apiRequestsDuring(page, () => page.goto(`/teams/${teamId}/dashboard`));

    expect(
      requests.length,
      `API request budget for a dashboard load. Requests made: ${requests.join(', ')}`,
    ).toBeLessThanOrEqual(2);
  });

  test('does not ask who is reading at all', async ({ page }) => {
    /*
     * Was two — the shell asked, and the page asked again for the roles, five
     * database queries each. Now neither does: the layout resolves the member
     * on the server and the shell offers it to the page.
     *
     * Zero rather than "at most one", because there is no request left to make
     * a threshold out of. `/api/me` still exists for the session page, which
     * has no shell around it and genuinely has to ask.
     */
    await signIn(page, EMAIL);

    const requests = await apiRequestsDuring(page, () => page.goto(`/teams/${teamId}/dashboard`));

    expect(
      requests.filter(path => path === '/api/me'),
      'identity requests per dashboard load',
    ).toHaveLength(0);
  });

  test('asks for the trends it renders', async ({ page }) => {
    // Guards the counter itself: a listener attached to nothing records nothing,
    // and every budget above would pass against an empty list
    await signIn(page, EMAIL);

    const requests = await apiRequestsDuring(page, () => page.goto(`/teams/${teamId}/dashboard`));

    expect(requests.some(path => path.includes('/trends'))).toBe(true);
  });
});
