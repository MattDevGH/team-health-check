import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Playwright accessibility tests using axe-core in a real browser.
 * Unlike jest-axe in JSDOM, these CAN detect colour contrast violations
 * because Playwright renders pages with actual computed styles.
 *
 * WCAG 2.1 AA requires:
 *   - Normal text: 4.5:1 contrast ratio
 *   - Large text (18px+ or 14px+ bold): 3:1 contrast ratio
 *
 * These tests cover all user-facing pages that contain form inputs,
 * where contrast issues are most likely to surface.
 */

test.describe('Accessibility — colour contrast and structure', () => {
  test('homepage has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('login page (magic link request) has no accessibility violations', async ({ page }) => {
    await page.goto('/auth/login');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('login page inputs have sufficient contrast for typed text', async ({ page }) => {
    await page.goto('/auth/login');

    // Type into the email field and verify it's readable
    const emailInput = page.getByLabel(/email/i);
    await emailInput.fill('user@example.com');

    // Run axe after text is entered (checks actual rendered contrast)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('input')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
