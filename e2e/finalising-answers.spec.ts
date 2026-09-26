/**
 * A member says they have finished, in a browser.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.5, 18.6; 16.1
 *
 * Two problems met in one place. A member who edited an answer a second time
 * could not tell that anything had happened, because the page looked the same
 * afterwards. And the rolling average was computed over rows that could still
 * be changed and handed back to the member who had just written one — so
 * reading it, changing a score and reading it again gave the size of the
 * window and the sum of everybody else's answers.
 *
 * Every step here is a click. The database is read directly afterwards to
 * check what was actually stored, rather than trusting what the page said —
 * "the page shows 3.5" proves rendering, not correctness.
 */

import { test, expect } from './fixtures';
import { read, seedSession, seedTeam } from './db';
import { signIn } from './sign-in';

const EMAIL = 'finalising@e2e.invalid';

/** What the database says about this member's answers to this session. */
function storedAnswers(memberId: string, sessionId: string) {
  return read(db =>
    db
      .prepare('SELECT questionId, score, finalisedAt FROM Response WHERE memberId = ? AND sessionId = ?')
      .all(memberId, sessionId),
  ) as Array<{ questionId: string; score: number; finalisedAt: string | null }>;
}

test.describe('marking answers final', () => {
  let teamId = '';
  let memberId = '';
  let sessionId = '';
  let token = '';

  test.beforeEach(() => {
    const team = seedTeam({ teamName: 'Finalising Team', memberEmail: EMAIL });
    teamId = team.teamId;
    memberId = team.memberId;

    const session = seedSession({ teamId, memberId, index: 0, status: 'open' });
    sessionId = session.sessionId;
    token = session.token;
  });

  test('a member answers, is told they can still change it, then finishes', async ({ page }) => {
    await page.goto(`/session/${token}`);
    await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();

    // Answer every question through the form, as a person would
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
    await expect(page.getByRole('status')).toContainText(/your answers are saved/i);

    /*
     * Requirement 18.5 — the consequence is stated before the button is
     * pressed, not behind a dialog nobody reads.
     */
    const finish = page.getByRole('button', { name: /finished.*final/i });
    await expect(finish).toBeVisible();
    await expect(page.getByText(/you will not be able to change them/i)).toBeVisible();

    // Nothing is final until they say so — Requirement 16.1 depends on this
    expect(storedAnswers(memberId, sessionId).every(a => a.finalisedAt === null)).toBe(true);

    await finish.click();

    // Requirement 18.6 — answers, not a form that would refuse the next save
    await expect(page.getByRole('heading', { name: /you have finished/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /submit responses/i })).toHaveCount(0);

    // Requirement 18.2 — read back, rather than believing the page
    const stored = storedAnswers(memberId, sessionId);
    expect(stored).toHaveLength(5);
    expect(stored.every(answer => answer.finalisedAt !== null)).toBe(true);
  });

  test('reopening the link still shows the answers as final', async ({ page }) => {
    await page.goto(`/session/${token}`);
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
        .filter({ hasText: /^3$/ })
        .click();
    }

    await page.getByRole('button', { name: /submit responses/i }).click();
    await expect(page.getByRole('status')).toContainText(/your answers are saved/i);
    await page.getByRole('button', { name: /finished.*final/i }).click();
    await expect(page.getByRole('heading', { name: /you have finished/i })).toBeVisible();

    // A fresh load, which is where a seeded-from-context bug would show
    await page.goto(`/session/${token}`);

    await expect(page.getByRole('heading', { name: /you have finished/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /finished.*final/i })).toHaveCount(0);
  });

  test('the finish control is not offered before anything is answered', async ({ page }) => {
    // Requirement 18.1 — there is nothing to be finished with yet
    await page.goto(`/session/${token}`);

    await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /finished.*final/i })).toHaveCount(0);
  });

  test('signing in separately does not change what the link shows', async ({ page }) => {
    // The member reaching their check while already signed in is the common
    // path since `reaching-your-health-check`, and it must see the same state
    await signIn(page, EMAIL);
    await page.goto(`/session/${token}`);

    await expect(page.getByRole('button', { name: /finished.*final/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /health check/i })).toBeVisible();
  });
});
