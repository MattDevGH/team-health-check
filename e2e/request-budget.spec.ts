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

/**
 * The menu arrives whole.
 *
 * Requirements: Feeling Responsive 2.1, 2.2, 4.3, NFR 1.3
 *
 * "The menu lazy loads in, showing some options then the rest popping in later
 * as they are ready." That was the shell rendering what it could name without a
 * team id, then re-rendering when `/api/me` resolved.
 *
 * Two tests, because the complaint has two halves: the destinations have to be
 * there from the start, and their arrival must not move what is already on
 * screen.
 */
test.describe('how the navigation arrives', () => {
  const EMAIL = 'first-paint@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const seeded = seedClosedSessions({
      teamName: 'First Paint Team',
      memberEmail: EMAIL,
      privacyMode: 'attributed',
      sessions: [
        { closedAt: OLDER, aggregates: [aggregate({ questionId: 'q-delivering-value' })] },
        { closedAt: NEWER, aggregates: [aggregate({ questionId: 'q-delivering-value' })] },
      ],
    });
    teamId = seeded.teamId;
  });

  test('sends every destination in the HTML, before any JavaScript runs', async ({ page }) => {
    /*
     * Read as bytes rather than rendered.
     *
     * A browser assertion would pass against a shell that fetched its context
     * and re-rendered a moment later, because Playwright waits. The document
     * the server sent cannot wait for anything, so if the links are in it they
     * were resolved before it left.
     *
     * `page.request` shares the browser context's cookies, so this is the same
     * member's page rather than an anonymous one.
     */
    await signIn(page, EMAIL);

    const response = await page.request.get(`/teams/${teamId}/dashboard`);
    const html = await response.text();

    expect(html).toContain(`/teams/${teamId}/dashboard`);
    expect(html).toContain(`/teams/${teamId}/settings`);
    expect(html).toContain('/me/health-check');
    expect(html).toContain('First Paint Team');
  });

  test('sends the role-gated destination to the member who has the role', async ({ page }) => {
    // The gate has to survive being resolved on the server. Getting it wrong in
    // the other direction would offer every member a page that refuses them.
    await signIn(page, EMAIL);

    const html = await (await page.request.get(`/teams/${teamId}/dashboard`)).text();

    expect(html, 'the seeded member is a delivery manager').toContain(
      `/teams/${teamId}/audit-log`,
    );
  });

  test('does not shift the page while it settles', async ({ page }) => {
    /*
     * Cumulative Layout Shift, which is the measurable form of "it popped in".
     *
     * **A ratchet, not the standard threshold.** 0.1 is the industry line for a
     * good experience, and this page passed it *with* the pop-in: measured
     * 0.046 while the shell fetched its own context, against 0.016 once the
     * layout resolved it. A test written to 0.1 would have watched the defect
     * this phase exists to remove and said nothing — proven by mutation, which
     * is how the number came to be 0.03.
     *
     * 0.016 is stable to five decimal places across repeated runs here, so the
     * headroom is generous. If it ever proves flaky on another machine, the
     * number is what to revisit rather than the test.
     *
     * Buffered, so shifts that happened before this listener existed are
     * counted too — an unbuffered observer would miss exactly the early ones
     * this is about. Shifts following a real interaction are excluded, as the
     * metric defines.
     */
    await signIn(page, EMAIL);

    await page.goto(`/teams/${teamId}/dashboard`);
    await page.getByRole('region', { name: /latest session/i }).waitFor();
    await page.waitForLoadState('networkidle');

    const shift = await page.evaluate(async () => {
      interface LayoutShift extends PerformanceEntry {
        value: number;
        hadRecentInput: boolean;
      }

      return await new Promise<number>(resolve => {
        let total = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries() as LayoutShift[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });

        // One frame for the buffered entries to be delivered
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            observer.disconnect();
            resolve(total);
          }),
        );
      });
    });

    expect(shift, 'cumulative layout shift on the dashboard').toBeLessThan(0.03);
  });
});
