/**
 * What the dashboard says about a scheduler that has or has not run.
 *
 * Requirements: Remembering What Happened 5.1, 5.2, 5.3, 5.4; NFR 3.1
 *
 * The three messages differ only in data, and the data comes from a table the
 * trends route reads and the page renders. Unit tests pin the decision and the
 * wording; this is the only tier that proves the heartbeat reaches the browser
 * at all — the route could send the wrong field name and every test below this
 * one would still pass.
 */

import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';
import {
  clearSchedulerHeartbeat,
  seedClosedSessions,
  setSchedulerHeartbeat,
  type SeededAggregate,
} from './db';
import { signIn } from './sign-in';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Long enough ago that results are overdue rather than merely pending. */
const CLOSED_AT = new Date('2026-08-10T17:00:00.000Z');

const EMAIL = 'scheduler-visibility@e2e.invalid';
let teamId = '';

function aggregate(questionId: string, averageScore: number): SeededAggregate {
  return {
    questionId,
    averageScore,
    responseCount: 4,
    improvingCount: 2,
    stableCount: 2,
    decliningCount: 0,
  };
}

test.beforeAll(() => {
  /*
   * Two closed sessions so the dashboard takes its populated path, and the
   * second with **no aggregates**, which is what leaves the latest result
   * waiting on a materialisation that never came.
   */
  const seeded = seedClosedSessions({
    teamName: 'Results Visibility Team',
    memberEmail: EMAIL,
    privacyMode: 'attributed',
    sessions: [
      { closedAt: new Date('2026-08-03T17:00:00.000Z'), aggregates: [aggregate('q-delivering-value', 4)] },
      { closedAt: CLOSED_AT, aggregates: [] },
    ],
  });
  teamId = seeded.teamId;
});

test('says the scheduler has never run, when it never has', async ({ page }) => {
  // The shape a misconfigured CRON_SECRET takes on a fresh deployment, where
  // "results are overdue" points at a wait that is never going to end
  clearSchedulerHeartbeat();
  await signIn(page, EMAIL);
  await page.goto(`/teams/${teamId}/dashboard`);

  /*
   * Once per theme, because each row explains its own blankness — the same
   * shape the overdue message has always had. Asserted as a count rather than
   * with `.first()`, so a change that left one row explained and four blank
   * fails here.
   */
  const message = page.getByText(/scheduler has never run/i);
  await expect(message.first()).toBeVisible();
  await expect(message).toHaveCount(5);

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  expect(
    results.violations.flatMap(v => v.nodes.map(n => `${v.id} @ ${n.target.join(' ')}`)),
    'accessibility violations on the never-run message',
  ).toEqual([]);
});

test('says when the scheduler last ran, if that was before the close', async ({ page }) => {
  setSchedulerHeartbeat(new Date(CLOSED_AT.getTime() - 60 * 60 * 1000));
  await signIn(page, EMAIL);
  await page.goto(`/teams/${teamId}/dashboard`);

  const message = page.getByText(/scheduler has not run since 10 August 2026/i);
  await expect(message.first()).toBeVisible();
  await expect(message).toHaveCount(5);

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  expect(
    results.violations.flatMap(v => v.nodes.map(n => `${v.id} @ ${n.target.join(' ')}`)),
    'accessibility violations on the stalled message',
  ).toEqual([]);
});

test('stops naming the scheduler once it has run since the close', async ({ page }) => {
  /*
   * The message that changes what a reader does. With the scheduler
   * demonstrably running, "the scheduler may not be running" sends them to
   * restart a trigger that is already running.
   */
  setSchedulerHeartbeat(new Date(CLOSED_AT.getTime() + 60 * 60 * 1000));
  await signIn(page, EMAIL);
  await page.goto(`/teams/${teamId}/dashboard`);

  /*
   * Scoped to the results panel, not the page.
   *
   * The first version asserted the word appeared nowhere and failed on the
   * team's own name in the header — a fixture called "Scheduler Visibility
   * Team". The claim was always about the message rather than the document,
   * and an assertion that broad would break again on any team a customer
   * chooses to name.
   */
  const results = page.getByRole('region', { name: /latest/i });
  await expect(results.getByText(/taking longer than expected/i).first()).toBeVisible();
  await expect(results.getByText(/scheduler/i)).toHaveCount(0);
});

test('reads the heartbeat from the trends response, not from a second request', async ({
  page,
}) => {
  /*
   * Requirement 5.5. A page that got slower in order to report on punctuality
   * would be its own joke — so the heartbeat rides along with the request the
   * dashboard already makes, and this counts the requests to prove it.
   */
  setSchedulerHeartbeat(new Date(CLOSED_AT.getTime() + 60 * 60 * 1000));
  await signIn(page, EMAIL);

  const apiCalls: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(url.pathname);
  });

  await page.goto(`/teams/${teamId}/dashboard`);
  await expect(page.getByText(/taking longer than expected/i).first()).toBeVisible();

  /*
   * By prefix, not by `includes('scheduler')`.
   *
   * The first version matched the team's own id in the path — the fixture was
   * called "Scheduler Visibility Team" — and reported a request to the trends
   * endpoint as a request about the scheduler. A substring match over a URL
   * that carries user-chosen text was never going to hold.
   */
  expect(
    apiCalls.filter(path => path.startsWith('/api/scheduler')),
    'the dashboard should make no request of its own for the scheduler',
  ).toEqual([]);

  // And the heartbeat arrived anyway, on the request the page already makes
  expect(
    apiCalls.filter(path => path.endsWith('/trends')),
    'the dashboard should read its data once',
  ).toHaveLength(1);
});
