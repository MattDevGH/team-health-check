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
import { findOpenSession, seedMember, seedTeam } from './db';
import { signIn } from './sign-in';

const MANAGER = 'lifecycle-manager@e2e.invalid';
const CONTRIBUTOR = 'lifecycle-contributor@e2e.invalid';
let teamId = '';

test.beforeAll(() => {
  // A team with no sessions at all: the state a manager meets on day one
  const team = seedTeam({ teamName: 'Lifecycle Team', memberEmail: MANAGER });
  teamId = team.teamId;
  seedMember({ teamId: team.teamId, email: CONTRIBUTOR, role: 'contributor' });
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

test('a contributor sees no lifecycle controls', async ({ page }) => {
  await signIn(page, CONTRIBUTOR);
  await page.goto(`/teams/${teamId}/dashboard`);

  // Anchor on something the dashboard always renders, so the absence is
  // asserted against a loaded page
  await expect(page.getByRole('heading', { name: /trend dashboard/i })).toBeVisible();

  await expect(page.getByRole('region', { name: 'Health check' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /open a health check/i })).toHaveCount(0);
});
