/**
 * The authoritative end-to-end journey.
 *
 * Each stage is its own test so a failure localises, and `describe.serial`
 * stops the rest rather than reporting a cascade of confusing errors.
 *
 * The browser drives everything the product exposes a UI for, which now
 * includes opening and closing a session. Only the scheduler tick goes through
 * the API: it is a cron endpoint with no UI by design.
 *
 * Nothing is skipped. If the TEST_MODE capture is unavailable the run fails.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type { Page } from '@playwright/test';

import { test, expect, watchSharedPage } from './fixtures';
import {
  aggregatesForSession,
  backdateClose,
  findMemberEmail,
  findOpenSession,
  findSessionLinkToken,
  findTeamByName,
  responsesForSession,
} from './db';
import { E2E_CRON_SECRET } from './database';

const EMAIL = 'journey-owner@e2e.invalid';
const TEAM_NAME = 'Journey Team';
const MEMBER_NAME = 'Journey Teammate';
const MEMBER_EMAIL = 'journey-teammate@e2e.invalid';

/** Carried between stages; `describe.serial` guarantees the ordering. */
const state = {
  teamId: '',
  memberId: '',
  ownerMemberId: '',
  sessionIds: [] as string[],
};

interface Answer {
  questionId: string;
  /** Question title, used to disambiguate the score and trend groups. */
  title: string;
  score: number;
  trend?: string;
}

const FIRST_ANSWERS: Answer[] = [
  { questionId: 'q-delivering-value', title: 'Delivering Value', score: 4, trend: 'Improving' },
  { questionId: 'q-team-collaboration', title: 'Team Collaboration', score: 5 },
  { questionId: 'q-ease-of-delivery', title: 'Ease of Delivery', score: 3 },
  { questionId: 'q-learning-improving', title: 'Learning and Improving', score: 3 },
  { questionId: 'q-psychological-safety', title: 'Psychological Safety', score: 4 },
];

const SECOND_ANSWERS: Answer[] = [
  { questionId: 'q-delivering-value', title: 'Delivering Value', score: 5 },
  { questionId: 'q-team-collaboration', title: 'Team Collaboration', score: 4, trend: 'Declining' },
  { questionId: 'q-ease-of-delivery', title: 'Ease of Delivery', score: 3 },
  { questionId: 'q-learning-improving', title: 'Learning and Improving', score: 4 },
  { questionId: 'q-psychological-safety', title: 'Psychological Safety', score: 2 },
];

/**
 * Opens a session and answers it in the browser.
 *
 * Every step here is a real interaction: opening is now a button on the
 * dashboard, so nothing in this journey reaches for the API on a manager's
 * behalf. The scheduler tick below is the one exception, and it is a cron
 * endpoint with no UI by design.
 */
async function openSessionAndAnswer(
  page: Page,
  current: typeof state,
  answers: Answer[],
): Promise<void> {
  await page.goto(`/teams/${current.teamId}/dashboard`);

  const panel = page.getByRole('region', { name: 'Health check' });
  await expect(panel, 'a delivery manager should be offered the lifecycle panel').toBeVisible();
  await panel.getByRole('button', { name: /open a health check/i }).click();
  await expect(panel).toContainText(/collecting responses/i);

  const session = findOpenSession(current.teamId);
  expect(session, 'an open session should exist after opening one').toBeTruthy();
  current.sessionIds.push(session!.id);

  const token = findSessionLinkToken(current.ownerMemberId, session!.id);
  expect(token, 'opening a session should generate a link for each member').toBeTruthy();

  await page.goto(`/session/${token}`);
  await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();

  for (const answer of answers) {
    // Each question is a fieldset named after its title. Scoping to it matters:
    // every trend group shares the accessible name "Optional trend".
    const question = page.getByRole('group', { name: answer.title });

    // The radio inputs are sr-only, so the wrapping label is both the visible
    // control and what a real user clicks
    await question
      .getByRole('radiogroup', { name: `${answer.title} score` })
      .locator('label')
      .filter({ hasText: new RegExp(`^${answer.score}$`) })
      .click();

    if (answer.trend) {
      await question
        .getByRole('group', { name: 'Optional trend' })
        .getByRole('button', { name: answer.trend })
        .click();
    }
  }

  await page.getByRole('button', { name: /submit responses/i }).click();
  await expect(page.getByText(/submitted successfully/i)).toBeVisible();

  // What the browser submitted must be what the database stored
  const stored = responsesForSession(session!.id);
  expect(stored).toHaveLength(answers.length);
  for (const answer of answers) {
    const row = stored.find(item => item.questionId === answer.questionId);
    expect(row?.score, `stored score for ${answer.questionId}`).toBe(answer.score);
  }
}

/**
 * Closes the current session and materialises its aggregates.
 *
 * Materialisation runs on a scheduler tick once a 30-second quiet period has
 * passed. The close timestamp is backdated rather than sleeping, so the run
 * stays fast and deterministic.
 */
async function closeAndMaterialise(page: Page, current: typeof state): Promise<void> {
  const sessionId = current.sessionIds[current.sessionIds.length - 1];

  await page.goto(`/teams/${current.teamId}/dashboard`);

  const panel = page.getByRole('region', { name: 'Health check' });
  await panel.getByRole('button', { name: /^close the health check$/i }).click();
  await page.getByRole('button', { name: /^yes, close it$/i }).click();
  await expect(panel).toContainText(/results are still being prepared/i);

  expect(findOpenSession(current.teamId), 'the check should be closed server-side').toBeUndefined();

  backdateClose(sessionId);

  const tick = await page.request.post('/api/scheduler/tick', {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(tick.ok(), 'scheduler tick should materialise the closed session').toBe(true);
}

test.describe.serial('team lifecycle journey', () => {
  // One browser, one session, carried across every stage. Playwright gives each
  // test a fresh context by default, which would drop the cookie genesis set.
  let page: Page;
  let assertPageClean: () => void;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    assertPageClean = watchSharedPage(page);
  });

  test.afterEach(() => {
    assertPageClean();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('requests a magic link from the login page', async () => {
    await page.goto('/auth/login');

    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: /request access link/i }).click();

    // Anti-enumeration wording: the same regardless of whether the email exists
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
  });

  test('creates the team through the genesis form', async () => {
    const captured = await page.request.get(
      `/api/test/magic-link?email=${encodeURIComponent(EMAIL)}`,
    );
    expect(
      captured.ok(),
      'TEST_MODE magic-link capture must be available — a required scenario must fail, never skip',
    ).toBe(true);

    const { token } = await captured.json();
    expect(token).toBeTruthy();

    await page.goto(`/auth/magic/${token}`);

    await expect(page.getByRole('heading', { name: /create your team/i })).toBeVisible();
    await page.getByLabel('Team name').fill(TEAM_NAME);
    await page.getByRole('button', { name: /create team/i }).click();

    // Genesis returns to the home page once the session is established
    await expect(page).toHaveURL(/\/$/);

    const team = findTeamByName(TEAM_NAME);
    expect(team, 'team should exist in the E2E database').toBeTruthy();
    state.teamId = team!.id;
  });

  test('holds a session cookie set by the server, not injected by the test', async () => {
    const cookies = await page.context().cookies();
    const session = cookies.find(cookie => cookie.name === 'session');

    expect(session, 'the server must set the session cookie during genesis').toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(session!.value.length).toBeGreaterThan(20);

    // And it authenticates a protected endpoint through the browser context
    const me = await page.request.get('/api/me');
    expect(me.ok()).toBe(true);

    const profile = await me.json();
    expect(profile.teamId).toBe(state.teamId);
    state.ownerMemberId = profile.id;
  });

  test('saves a schedule from the settings page and persists it', async () => {
    await page.goto(`/teams/${state.teamId}/settings`);

    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
    await page.getByLabel('Open day').selectOption('1');
    await page.getByLabel('Open time').fill('09:00');
    await page.getByLabel('Close day').selectOption('5');
    await page.getByLabel('Close time').fill('17:00');
    await page.getByRole('button', { name: /save schedule/i }).click();

    await expect(page.getByRole('status')).toContainText(/schedule saved/i);

    // Reload proves persistence rather than optimistic UI state
    await page.reload();
    await expect(page.getByLabel('Open time')).toHaveValue('09:00');
    await expect(page.getByLabel('Close time')).toHaveValue('17:00');
  });

  test('adds a second team member from the settings page', async () => {
    await page.goto(`/teams/${state.teamId}/settings`);

    await page.getByLabel('Member name').fill(MEMBER_NAME);
    await page.getByLabel('Member email').fill(MEMBER_EMAIL);
    await page.getByRole('button', { name: /add member/i }).click();

    await expect(page.getByText(MEMBER_NAME)).toBeVisible();

    const member = findMemberEmail(state.teamId, MEMBER_EMAIL);
    expect(member, 'the added member should be persisted').toBeTruthy();
    state.memberId = member!.id;
  });

  test('opens the first session and answers it through the session link', async () => {
    await openSessionAndAnswer(page, state, FIRST_ANSWERS);
  });

  test('closes and materialises the first session', async () => {
    await closeAndMaterialise(page, state);

    const aggregates = aggregatesForSession(state.sessionIds[0]);
    expect(aggregates).toHaveLength(FIRST_ANSWERS.length);

    // The stored average must equal the single score submitted for it
    for (const answer of FIRST_ANSWERS) {
      const aggregate = aggregates.find(row => row.questionId === answer.questionId);
      expect(aggregate?.averageScore).toBe(answer.score);
      expect(aggregate?.responseCount).toBe(1);
    }
  });

  test('reports insufficient data on the dashboard after one session', async () => {
    await page.goto(`/teams/${state.teamId}/dashboard`);

    await expect(page.getByText(/more data needed/i)).toBeVisible();
  });

  test('opens the second session and answers it with different scores', async () => {
    await openSessionAndAnswer(page, state, SECOND_ANSWERS);

    expect(state.sessionIds[1]).not.toBe(state.sessionIds[0]);
  });

  test('closes and materialises the second session', async () => {
    await closeAndMaterialise(page, state);

    const aggregates = aggregatesForSession(state.sessionIds[1]);
    expect(aggregates).toHaveLength(SECOND_ANSWERS.length);

    for (const answer of SECOND_ANSWERS) {
      const aggregate = aggregates.find(row => row.questionId === answer.questionId);
      expect(aggregate?.averageScore).toBe(answer.score);
    }
  });

  test('leaves insufficient-data mode once a second session closes', async () => {
    await page.goto(`/teams/${state.teamId}/dashboard`);

    await expect(page.getByText(/more data needed/i)).toHaveCount(0);
  });

  test('suppresses per-session detail while responses stay below the anonymity threshold', async () => {
    await page.goto(`/teams/${state.teamId}/dashboard`);

    const stored = aggregatesForSession(state.sessionIds[1]);
    const psychologicalSafety = stored.find(row => row.questionId === 'q-psychological-safety');
    expect(psychologicalSafety?.responseCount).toBe(1);

    // Scoped to the drill-down: the legend carries a toggle of the same name
    await page
      .getByRole('region', { name: 'Question themes' })
      .getByRole('button', { name: /psychological safety/i })
      .click();

    // One respondent in an anonymous team is below the threshold of 3, so the
    // score must not be shown. Scoped to the drill-down by its accessible
    // relationship to the button: the chart renders axis labels and a data
    // table of every score, so a page-wide search matches those and proves
    // nothing. Exact per-value assertions live in dashboard.spec.ts, where
    // counts are seeded high enough to display.
    const detail = page.getByRole('region', { name: /psychological safety/i });
    await expect(detail).toContainText(/insufficient data/i);
    await expect(detail).not.toContainText(psychologicalSafety!.averageScore.toFixed(1));
  });
});
