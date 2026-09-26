/**
 * Tests for the reporter that decides whether a Playwright run counts.
 *
 * Requirements: Integration 10.7, 10.8, 10.9
 *
 * This is the only thing standing between a nondeterministic suite and a green
 * check, and until now nothing would have noticed if it stopped working. It
 * runs inside Playwright, so it was never reachable from the unit suite —
 * which is precisely why it needed to be a plain class with a plain interface.
 *
 * These drive it the way Playwright does: feed it test results, then ask what
 * it makes the run's status.
 */

import { describe, it, expect } from 'vitest';

import SuiteIntegrityReporter from './suite-integrity-reporter';

type Status = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** The part of Playwright's TestCase this reporter reads. */
function testCase(title: string) {
  return { titlePath: () => ['', 'chromium', 'file.spec.ts', title] };
}

/** The part of Playwright's TestResult this reporter reads. */
function testResult(status: Status, retry = 0) {
  return { status, retry };
}

/** Runs the reporter over a set of results and returns the run's final status. */
async function runWith(
  events: Array<{ title: string; status: Status; retry?: number }>,
  finalStatus: 'passed' | 'failed' = 'passed',
): Promise<string> {
  const reporter = new SuiteIntegrityReporter();

  for (const event of events) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural doubles
    reporter.onTestEnd(testCase(event.title) as any, testResult(event.status, event.retry) as any);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural double
  const override = await reporter.onEnd({ status: finalStatus } as any);
  return override?.status ?? finalStatus;
}

describe('a clean run', () => {
  it('is left alone', async () => {
    expect(
      await runWith([
        { title: 'signs in', status: 'passed' },
        { title: 'shows the dashboard', status: 'passed' },
      ]),
    ).toBe('passed');
  });

  it('does not rescue a run that genuinely failed', async () => {
    expect(await runWith([{ title: 'signs in', status: 'failed' }], 'failed')).toBe('failed');
  });
});

/** Requirement Integration 10.7 */
describe('a run containing a skipped test', () => {
  it('fails, because Playwright counts a skip as a pass', async () => {
    expect(
      await runWith([
        { title: 'signs in', status: 'passed' },
        { title: 'captures the email', status: 'skipped' },
      ]),
    ).toBe('failed');
  });
});

/**
 * Requirement Integration 10.8
 *
 * `retries: 2` in CI meant a test could fail twice and still produce a green
 * build. A first attempt that failed and a second that passed is a test that
 * did not behave the same way twice, which is the definition this project
 * works to.
 */
describe('a run containing a test that only passed on a retry', () => {
  it('fails', async () => {
    expect(
      await runWith([
        { title: 'counts requests', status: 'failed', retry: 0 },
        { title: 'counts requests', status: 'passed', retry: 1 },
      ]),
    ).toBe('failed');
  });

  it('fails even when the retry was the last attempt to run', async () => {
    expect(
      await runWith([
        { title: 'counts requests', status: 'failed', retry: 0 },
        { title: 'counts requests', status: 'failed', retry: 1 },
        { title: 'counts requests', status: 'passed', retry: 2 },
      ]),
    ).toBe('failed');
  });

  it('leaves a first-attempt pass alone', async () => {
    // The common case, and the one that must stay fast and green
    expect(await runWith([{ title: 'counts requests', status: 'passed', retry: 0 }])).toBe('passed');
  });

  it('does not treat a test that failed every attempt as flaky', async () => {
    // Deterministically broken is a different report from nondeterministic,
    // and conflating them sends the next person looking for the wrong thing
    const reporter = new SuiteIntegrityReporter();
    for (const retry of [0, 1, 2]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural doubles
      reporter.onTestEnd(testCase('always broken') as any, testResult('failed', retry) as any);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural double
    const override = await reporter.onEnd({ status: 'failed' } as any);

    expect(override?.status ?? 'failed').toBe('failed');
    expect(reporter.flakyTitles).toHaveLength(0);
  });
});

describe('what the run reports', () => {
  it('names the test that was nondeterministic', async () => {
    const reporter = new SuiteIntegrityReporter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural doubles
    reporter.onTestEnd(testCase('counts requests') as any, testResult('failed', 0) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural doubles
    reporter.onTestEnd(testCase('counts requests') as any, testResult('passed', 1) as any);

    expect(reporter.flakyTitles.join('\n')).toContain('counts requests');
  });

  it('names the test that was skipped', async () => {
    const reporter = new SuiteIntegrityReporter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow structural doubles
    reporter.onTestEnd(testCase('captures the email') as any, testResult('skipped') as any);

    expect(reporter.skippedTitles.join('\n')).toContain('captures the email');
  });
});
