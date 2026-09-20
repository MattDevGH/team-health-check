/**
 * A contributor reaches their own health check and answers it.
 *
 * Requirements: Reaching Your Health Check 1.1, 1.2, 1.5, NFR 1.1
 *
 * The route tests prove the API answers a contributor. Nothing walked one
 * through a browser, and Requirement 1.5 exists precisely because a
 * contributor's journey is not a manager's: they never open a check, never
 * close one, and until this milestone had nowhere in the application to answer
 * one either.
 *
 * Writing it found the gap it was meant to prove absent. The dashboard rendered
 * the lifecycle panel — the thing that carries the route to answer — only
 * for a Delivery Manager, so a contributor who came to read their team's
 * results while a check was collecting was shown no way to take part. The panel
 * is rendered for everybody now with its open and close controls gated, and
 * both halves are asserted below: the route they gained, and the two controls
 * they must still not be offered.
 *
 * Every step is a click. Nothing here looks a token up and navigates to it,
 * which is the pattern that let a check open in production on 2026-09-14 with
 * no way in and a fully green suite.
 */

import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { responsesForSession, seedMember, seedSession, seedTeam } from './db';
import { signIn } from './sign-in';

/**
 * A manager address per team.
 *
 * Member ids are derived from the address, and `seedTeam` clears the members
 * of its own team only — so one address across three teams collides on
 * `TeamMember.id` and every test in the file fails in the fixture rather than
 * in the behaviour.
 */
const managerFor = (suffix: string) => `contributor-check-manager-${suffix}@e2e.invalid`;

interface Answer {
  questionId: string;
  title: string;
  score: number;
}

const ANSWERS: Answer[] = [
  { questionId: 'q-delivering-value', title: 'Delivering Value', score: 4 },
  { questionId: 'q-team-collaboration', title: 'Team Collaboration', score: 5 },
  { questionId: 'q-ease-of-delivery', title: 'Ease of Delivery', score: 2 },
  { questionId: 'q-learning-improving', title: 'Learning and Improving', score: 3 },
  { questionId: 'q-psychological-safety', title: 'Psychological Safety', score: 5 },
];

/**
 * A team with a check collecting and a contributor who has a link for it.
 *
 * One team per test. Magic links are rate-limited per address and the seed
 * clears a team's members, so sharing either between tests makes a failure
 * report the fixture rather than the behaviour.
 */
function seedContributorWithOpenCheck(suffix: string): {
  teamId: string;
  contributorEmail: string;
  sessionId: string;
} {
  const contributorEmail = `contributor-check-${suffix}@e2e.invalid`;
  const team = seedTeam({
    teamName: `Contributor Check Team ${suffix}`,
    memberEmail: managerFor(suffix),
  });
  const contributor = seedMember({
    teamId: team.teamId,
    email: contributorEmail,
    name: 'Fixture Contributor',
    role: 'contributor',
  });
  const session = seedSession({
    teamId: team.teamId,
    memberId: contributor.memberId,
    status: 'open',
  });

  return { teamId: team.teamId, contributorEmail, sessionId: session.sessionId };
}

/** Answers every question and submits, entirely through the form. */
async function answerEverything(page: Page): Promise<void> {
  for (const answer of ANSWERS) {
    const question = page.getByRole('group', { name: answer.title });
    await question
      .getByRole('radiogroup', { name: `${answer.title} score` })
      .locator('label')
      .filter({ hasText: new RegExp(`^${answer.score}$`) })
      .click();
  }

  await page.getByRole('button', { name: /submit responses/i }).click();
  await expect(page.getByRole('status')).toContainText(/your answers are saved/i);
}

/** What the database holds, which is the only proof the answers landed. */
function expectStored(sessionId: string): void {
  const stored = responsesForSession(sessionId);
  expect(stored, 'responses the browser submitted should be in the database').toHaveLength(
    ANSWERS.length,
  );
  for (const answer of ANSWERS) {
    const row = stored.find(item => item.questionId === answer.questionId);
    expect(row?.score, `stored score for ${answer.questionId}`).toBe(answer.score);
  }
}

test.describe('a contributor, from the dashboard', () => {
  let fixture: ReturnType<typeof seedContributorWithOpenCheck>;

  test.beforeAll(() => {
    fixture = seedContributorWithOpenCheck('dashboard');
  });

  test('is offered the route to answer, and neither control they cannot use', async ({ page }) => {
    /*
     * Requirement 1.1, and the defect this spec found. The panel was withheld
     * entirely from anybody who could not manage, which withheld the answer
     * link with it.
     *
     * The presence is asserted first so the two absences are read against a
     * rendered panel rather than a page that failed to load one.
     */
    await signIn(page, fixture.contributorEmail);
    await page.goto(`/teams/${fixture.teamId}/dashboard`);

    const panel = page.getByRole('region', { name: 'Health check' });
    await expect(panel).toContainText(/collecting responses/i);
    await expect(panel.getByRole('link', { name: /go to your health check/i })).toBeVisible();

    await expect(panel.getByRole('button', { name: /open a health check/i })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /close the health check/i })).toHaveCount(0);
  });

  test('answers it, and the answers are in the database', async ({ page }) => {
    await signIn(page, fixture.contributorEmail);
    await page.goto(`/teams/${fixture.teamId}/dashboard`);

    await page
      .getByRole('region', { name: 'Health check' })
      .getByRole('link', { name: /go to your health check/i })
      .click();
    await expect(page).toHaveURL(/\/me\/health-check$/);

    await page.getByRole('link', { name: /answer the health check/i }).click();
    await expect(page).toHaveURL(/\/session\/[^/]+$/);

    await answerEverything(page);

    expectStored(fixture.sessionId);
  });
});

test.describe('a contributor, from the navigation', () => {
  let fixture: ReturnType<typeof seedContributorWithOpenCheck>;

  test.beforeAll(() => {
    fixture = seedContributorWithOpenCheck('navigation');
  });

  test('reaches the form by clicking Health check, and answers it', async ({ page }) => {
    /*
     * Requirements 1.2 and 1.5. This is the route a contributor actually uses:
     * they arrive from a prompt or from nothing at all, and the dashboard is
     * not where they live.
     */
    await signIn(page, fixture.contributorEmail);

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Health check' })
      .click();
    await expect(page).toHaveURL(/\/me\/health-check$/);

    await page.getByRole('link', { name: /answer the health check/i }).click();
    await expect(page).toHaveURL(/\/session\/[^/]+$/);

    await answerEverything(page);

    expectStored(fixture.sessionId);
  });

  test('sees the confirmation without going looking for it', async ({ page }) => {
    /*
     * Requirements: Explaining Itself 2.6
     *
     * The confirmation used to render above the form. Above five questions is
     * off the top of the screen by the time anybody reaches the button — and
     * the first person to answer a check on the deployed application submitted,
     * saw nothing happen, and found the message by scrolling up.
     *
     * At phone width, so the form is certainly taller than the screen: on a
     * tall desktop window the whole page fits and a confirmation at the top
     * would pass regardless.
     *
     * `toBeVisible` would have passed throughout. An element scrolled out of
     * view is still visible in Playwright's sense, so this has to assert where
     * it is rather than whether it exists.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, fixture.contributorEmail);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Health check' })
      .click();
    await page.getByRole('link', { name: /answer the health check/i }).click();

    const scores = page.getByRole('radiogroup');
    await expect(scores).toHaveCount(5);
    for (const group of await scores.all()) {
      await group.locator('label').filter({ hasText: /^3$/ }).click();
    }
    await page.getByRole('button', { name: /responses$/i }).click();

    const confirmation = page.getByRole('status');
    await expect(confirmation).toBeInViewport();
  });

  test('can go back in and change an answer', async ({ page }) => {
    /*
     * Requirement 1.4. Answers are editable until the check closes, and a
     * member who has finished must still be able to get back in — mutation
     * checked at the unit tier by hiding the link at full participation, which
     * is exactly the "helpful" change that would otherwise pass.
     */
    await signIn(page, fixture.contributorEmail);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Health check' })
      .click();

    await page.getByRole('link', { name: /answer the health check/i }).click();

    /*
     * Wait for the control to say "Update", which is how the page says the
     * stored answers have arrived.
     *
     * Without this the test races the fetch: the form mounts empty, a click on
     * one score lands, the context arrives and re-renders, and the submission
     * fails validation on the four questions the test believed were already
     * answered. It passed until a test was inserted above it and shifted the
     * timing, which is the definition of a test that was never really passing.
     */
    await expect(page.getByRole('button', { name: /^update responses$/i })).toBeVisible();

    const question = page.getByRole('group', { name: 'Ease of Delivery' });
    await question
      .getByRole('radiogroup', { name: 'Ease of Delivery score' })
      .locator('label')
      .filter({ hasText: /^5$/ })
      .click();
    await page.getByRole('button', { name: /update responses|submit responses/i }).click();
    /*
     * Named as an update, because that is what it was — they arrived with
     * answers already stored and changed one.
     *
     * This asserted `/saved|no changes/i` before, which passed against the
     * defect found on the deployed application on 2026-09-18: a second save
     * rendering the message already on screen, so a successful update was
     * indistinguishable from nothing happening.
     */
    await expect(page.getByRole('status')).toContainText(/updated/i);

    const stored = responsesForSession(fixture.sessionId);
    expect(
      stored.find(item => item.questionId === 'q-ease-of-delivery')?.score,
      'the changed answer should be the one stored',
    ).toBe(5);
  });
});

test.describe('a contributor with nothing open', () => {
  const CONTRIBUTOR = 'contributor-check-nothing@e2e.invalid';
  let teamId = '';

  test.beforeAll(() => {
    const team = seedTeam({
      teamName: 'Contributor Nothing Team',
      memberEmail: managerFor('nothing'),
    });
    teamId = team.teamId;
    seedMember({ teamId: team.teamId, email: CONTRIBUTOR, role: 'contributor' });
  });

  test('is told so rather than shown a route into nothing', async ({ page }) => {
    // Requirement 1.3. A link to an empty page says there is something to do
    await signIn(page, CONTRIBUTOR);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Health check' })
      .click();

    await expect(page.getByText(/no health check is open/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /answer the health check/i })).toHaveCount(0);
  });

  test('sees the same on the dashboard panel', async ({ page }) => {
    await signIn(page, CONTRIBUTOR);
    await page.goto(`/teams/${teamId}/dashboard`);

    const panel = page.getByRole('region', { name: 'Health check' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: /go to your health check/i })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /open a health check/i })).toHaveCount(0);
  });
});
