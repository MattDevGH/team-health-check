/**
 * Fails the run if any test skipped.
 *
 * Playwright reports a skipped test as a pass at the job level, so a suite can
 * be green having proved nothing — which is exactly how the old happy path
 * behaved for months, calling `test.skip` against an endpoint that never
 * existed. Requirement 10.5 asks for that to be impossible rather than merely
 * discouraged.
 *
 * If a scenario ever genuinely should not run, delete it or make its absence
 * fail loudly. Do not reach for `skip`.
 *
 * Requirements: 10.5, 10.6
 */

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

class NoSkipsReporter implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') {
      this.skipped.push(test.titlePath().filter(Boolean).join(' › '));
    }
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | undefined> {
    if (this.skipped.length === 0) return undefined;

    console.error(
      `\n${this.skipped.length} test(s) were skipped. Required scenarios must fail rather than skip:`,
    );
    for (const title of this.skipped) {
      console.error(`  - ${title}`);
    }

    // Override an otherwise-passing run
    return { status: result.status === 'passed' ? 'failed' : result.status };
  }
}

export default NoSkipsReporter;
