/**
 * A manager closes a check and watches the results actually arrive.
 *
 * Requirements: Explaining Itself 1.1, 1.2, 1.4, 1.5
 *
 * Closing a check does not compute its results. A scheduler tick does, at least
 * thirty seconds later, and before this milestone the gap rendered as an empty
 * dashboard — which reads as nobody having answered rather than as results
 * still being prepared. Three different states were the same blankness.
 *
 * The halves of that promise were proved separately and never joined up.
 * `session-lifecycle.spec.ts` watches the panel say results are being prepared;
 * `journey.spec.ts` ticks and reads aggregates out of the database; nothing
 * walked a person from one to the other and watched the message go away. A
 * message that appears correctly and never clears is the same defect in slow
 * motion.
 *
 * Requirement 1.2 asks the dashboard to bound the wait — "a few minutes"
 * rather than an open-ended "being prepared" — and until now that sentence
 * existed only in a jsdom test. It is the sentence that decides whether a
 * reader waits or goes looking for a fault.
 */

import { test, expect } from './fixtures';
import {
  backdateClose,
  findOpenSession,
  seedSession,
  seedTeam,
  setSchedulerHeartbeat,
} from './db';
import { E2E_CRON_SECRET } from './database';
import { signIn } from './sign-in';

const MANAGER = 'results-arriving@e2e.invalid';

let teamId = '';
let sessionId = '';

test.beforeAll(() => {
  /*
   * Attributed, so the score this walk produces is actually shown.
   *
   * In anonymous mode one respondent is below the threshold of 3 and every
   * value reads "Hidden until 3 people have answered" — which is a different
   * explanation for a different reason, covered by its own tests. Asserting
   * "results arrived" against a panel full of suppression notices would prove
   * the message cleared and nothing about what replaced it.
   */
  const team = seedTeam({
    teamName: 'Results Arriving Team',
    memberEmail: MANAGER,
    privacyMode: 'attributed',
  });
  teamId = team.teamId;
  sessionId = seedSession({
    teamId: team.teamId,
    memberId: team.memberId,
    status: 'open',
  }).sessionId;
});

test.beforeEach(() => {
  /*
   * A scheduler that ran recently, because that is what separates the two
   * messages this spec is about. Running means "being prepared"; silent for
   * long enough means "overdue", which is a different sentence for a different
   * problem — and the heartbeat is one shared row, so whichever spec touched it
   * last would otherwise decide what this one sees.
   */
  setSchedulerHeartbeat(new Date());
});

test('says results are coming, then shows them, and stops saying it', async ({ page }) => {
  await signIn(page, MANAGER);

  // Answer first, so there is something for the tick to compute
  await page.goto(`/teams/${teamId}/dashboard`);
  await page
    .getByRole('region', { name: 'Health check' })
    .getByRole('link', { name: /go to your health check/i })
    .click();
  await page.getByRole('link', { name: /answer the health check/i }).click();

  const scores = page.getByRole('radiogroup');
  await expect(scores).toHaveCount(5);
  for (const group of await scores.all()) {
    await group.locator('label').filter({ hasText: /^4$/ }).click();
  }
  await page.getByRole('button', { name: /^submit responses$/i }).click();
  await expect(page.getByRole('status')).toContainText(/saved/i);

  // Close it through the interface, the way a manager would
  await page.goto(`/teams/${teamId}/dashboard`);
  const panel = page.getByRole('region', { name: 'Health check' });
  await panel.getByRole('button', { name: /^close the health check$/i }).click();
  await page.getByRole('button', { name: /^yes, close it$/i }).click();

  await expect(panel).toContainText(/results are still being prepared/i);
  expect(findOpenSession(teamId), 'the check should be closed server-side').toBeUndefined();

  /*
   * Requirement 1.2. "Being prepared" with no horizon is indistinguishable from
   * broken, and a reader with no horizon either refreshes forever or gives up.
   */
  await expect(panel).toContainText(/few minutes/i);

  // The quiet period is 30 seconds of real time, which a test must not wait out
  backdateClose(sessionId);
  const tick = await page.request.post('/api/scheduler/tick', {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(tick.ok(), 'the scheduler tick should be accepted').toBe(true);
  expect(
    ((await tick.json()) as { materialised?: number }).materialised,
    'the tick should have computed this session',
  ).toBeGreaterThan(0);

  await page.reload();

  /*
   * The half nothing proved: the message goes away and a number takes its
   * place. Asserted on the same panel, so "it stopped saying it" cannot be
   * satisfied by the panel having failed to render at all.
   */
  const latest = page.getByRole('region', { name: /latest session/i });
  await expect(latest).toBeVisible();
  await expect(latest).not.toContainText(/being prepared/i);
  await expect(latest).not.toContainText(/overdue/i);
  await expect(latest).toContainText('4');
});

test('never accuses the team of not answering while it is still computing', async ({ page }) => {
  /*
   * Requirement 1.4, which is the reason the milestone exists. "Nobody
   * answered" and "not computed yet" were the same blankness, so a tool that
   * had stopped running reported that a team had ignored its health check.
   *
   * Runs against the state left by the test above — closed and computed — plus
   * a fresh check that has only just closed, so both halves of the distinction
   * are on screen in one place.
   */
  await signIn(page, MANAGER);
  await page.goto(`/teams/${teamId}/dashboard`);

  const latest = page.getByRole('region', { name: /latest session/i });
  await expect(latest).toBeVisible();
  await expect(latest, 'a computed result must not read as unanswered').not.toContainText(
    /no responses/i,
  );
});
