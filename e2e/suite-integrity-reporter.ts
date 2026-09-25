/**
 * Fails a Playwright run that reports green without having proved anything.
 *
 * Requirements: Integration 10.7, 10.8, 10.9
 *
 * Two ways a suite can be green and worthless:
 *
 * **A skipped test.** Playwright reports it as a pass at the job level, so a
 * required scenario can opt out and still count. That is how the original happy
 * path behaved for months, calling `test.skip` against an endpoint that never
 * existed. If a scenario genuinely should not run, delete it or make its absence
 * fail loudly. Do not reach for `skip`.
 *
 * **A test that only passed on a retry.** `retries: 2` in CI meant a test could
 * fail twice and still produce a green build. A test that did not behave the
 * same way twice is a defect by this project's own rule, and the rule was
 * written down without being enforced anywhere. Retries stay switched on: the
 * point is to *record* the nondeterminism and name it, not to lose the run to a
 * single blip with no diagnosis.
 *
 * A test that failed every attempt is not flaky, it is broken, and the run is
 * already failing for that reason. Conflating the two sends the next person
 * looking for the wrong thing.
 *
 * This file was `no-skips-reporter.ts` until 2026-09-25, and cited "Integration
 * 10.5, 10.6" — which are about running without external services and about the
 * CI job existing. Neither mentions skipping. The citation resolved, so the
 * reference checker could not see it; 10.7 says what this actually does.
 */

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class SuiteIntegrityReporter implements Reporter {
  /** Titles of tests that skipped. Public so the reporter's own tests can read it. */
  readonly skippedTitles: string[] = [];

  /** Titles of tests that failed an attempt and then passed one. */
  readonly flakyTitles: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const title = test.titlePath().filter(Boolean).join(' › ');

    if (result.status === 'skipped') {
      this.skippedTitles.push(title);
      return;
    }

    // A pass on anything but the first attempt means an earlier one failed
    if (result.status === 'passed' && result.retry > 0 && !this.flakyTitles.includes(title)) {
      this.flakyTitles.push(title);
    }
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | undefined> {
    if (this.skippedTitles.length === 0 && this.flakyTitles.length === 0) return undefined;

    if (this.skippedTitles.length > 0) {
      console.error(
        `\n${this.skippedTitles.length} test(s) were skipped. Required scenarios must fail rather than skip:`,
      );
      for (const title of this.skippedTitles) {
        console.error(`  - ${title}`);
      }
    }

    if (this.flakyTitles.length > 0) {
      console.error(
        `\n${this.flakyTitles.length} test(s) passed only after a retry. A flaky test is a defect:` +
          '\nFix it or delete it. Do not re-run until green.',
      );
      for (const title of this.flakyTitles) {
        console.error(`  - ${title}`);
      }
    }

    // Override an otherwise-passing run; never rescue a failing one
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}

export default SuiteIntegrityReporter;
