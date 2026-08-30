/**
 * Opening a health check through the UI, in a real browser.
 *
 * Requirements: Manager Experience 2.1, 2.2, 2.4, 2.6
 *
 * jsdom can prove the component calls the right endpoint and renders the right
 * state. It cannot prove a real mouse click on a real button reaches the
 * handler in a hydrated page — the failure mode that leaves a feature looking
 * finished and doing nothing.
 *
 * Grows with the close control in task 3.4; the journey spec stops reaching for
 * the API in 3.7.
 */

import { test, expect } from './fixtures';
import { findOpenSession, seedMember, seedSession, seedTeam } from './db';
import { signIn } from './sign-in';

const MANAGER = 'lifecycle-manager@e2e.invalid';
const CONTRIBUTOR = 'lifecycle-contributor@e2e.invalid';
const CANCELLER = 'lifecycle-canceller@e2e.invalid';
const CONFIRMER = 'lifecycle-confirmer@e2e.invalid';
let teamId = '';
let cancelTeamId = '';
let confirmTeamId = '';

/**
 * Each closing test gets its own team with its own running check.
 *
 * Sharing one would couple the tests by order — whichever closed it first would
 * leave the other with nothing to close — and sharing one member would spend
 * two of the five magic links an email gets per hour, which CI's two retries
 * can exhaust.
 */
function seedTeamWithOpenCheck(teamName: string, memberEmail: string): string {
  const team = seedTeam({ teamName, memberEmail });
  seedSession({ teamId: team.teamId, memberId: team.memberId, status: 'open' });
  return team.teamId;
}

test.beforeAll(() => {
  // A team with no sessions at all: the state a manager meets on day one
  const team = seedTeam({ teamName: 'Lifecycle Team', memberEmail: MANAGER });
  teamId = team.teamId;
  seedMember({ teamId: team.teamId, email: CONTRIBUTOR, role: 'contributor' });

  cancelTeamId = seedTeamWithOpenCheck('Lifecycle Cancel Team', CANCELLER);
  confirmTeamId = seedTeamWithOpenCheck('Lifecycle Confirm Team', CONFIRMER);
});

test('a delivery manager opens the team\'s first health check', async ({ page }) => {
  await signIn(page, MANAGER);
  await page.goto(`/teams/${teamId}/dashboard`);

  const panel = page.getByRole('region', { name: 'Health check' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/no health check has run/i);

  expect(findOpenSession(teamId), 'no session should exist before the click').toBeUndefined();

  await panel.getByRole('button', { name: /open a health check/i }).click();

  await expect(panel).toContainText(/collecting responses/i);

  // The rendered state proves what the page believes; the row proves what the
  // server actually did
  expect(findOpenSession(teamId), 'the click should have opened a real session').toBeDefined();

  // Opening a second check while one is running must not be offered
  await expect(panel.getByRole('button', { name: /open a health check/i })).toHaveCount(0);
});

/**
 * The confirmation is a native `<dialog>` opened with `showModal()`. jsdom
 * implements neither `showModal` nor the `cancel` event, so the modality, the
 * backdrop and the browser's own Escape handling can only be proven here.
 */
test('closing is confirmed, and cancelling leaves the check running', async ({ page }) => {
  await signIn(page, CANCELLER);
  await page.goto(`/teams/${cancelTeamId}/dashboard`);

  const panel = page.getByRole('region', { name: 'Health check' });
  await expect(panel).toContainText(/collecting responses/i);

  const trigger = panel.getByRole('button', { name: /^close the health check$/i });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: /close this health check/i });
  await expect(dialog).toBeVisible();

  // showModal() puts the dialog in the top layer; a non-modal one would not
  // report itself as modal
  expect(await dialog.evaluate((el: HTMLDialogElement) => el.matches(':modal'))).toBe(true);

  // The confirm button takes focus, so a keyboard user lands inside the dialog
  await expect(dialog.getByRole('button', { name: /^yes, close it$/i })).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(findOpenSession(cancelTeamId), 'Escape must not close the check').toBeDefined();

  // And cancelling explicitly behaves the same way
  await trigger.click();
  await page.getByRole('button', { name: /^cancel$/i }).click();
  await expect(trigger).toBeFocused();
  expect(findOpenSession(cancelTeamId), 'Cancel must not close the check').toBeDefined();
});

test('confirming closes the check for real', async ({ page }) => {
  await signIn(page, CONFIRMER);
  await page.goto(`/teams/${confirmTeamId}/dashboard`);

  const panel = page.getByRole('region', { name: 'Health check' });
  await panel.getByRole('button', { name: /^close the health check$/i }).click();
  await page.getByRole('button', { name: /^yes, close it$/i }).click();

  await expect(panel).toContainText(/results are still being prepared/i);

  // The rendered text is what the page believes; the absent row is what the
  // server actually did
  expect(findOpenSession(confirmTeamId), 'the check should be closed server-side').toBeUndefined();
});

test('a contributor sees no lifecycle controls', async ({ page }) => {
  await signIn(page, CONTRIBUTOR);
  await page.goto(`/teams/${teamId}/dashboard`);

  // Anchor on something the dashboard always renders, so the absence is
  // asserted against a loaded page
  await expect(page.getByRole('heading', { name: /trend dashboard/i })).toBeVisible();

  await expect(page.getByRole('region', { name: 'Health check' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /open a health check/i })).toHaveCount(0);
});
