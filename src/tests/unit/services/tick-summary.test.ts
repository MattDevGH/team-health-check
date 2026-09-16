/**
 * A tick that says what it did in a sentence.
 *
 * Requirements: Knowing What Happened 1.4
 *
 * The response was `{ opened: 0, closed: 0, materialised: 2, prompts: 3, … }`,
 * and Matt's verdict on seeing it in cron-job.org was that it did not look like
 * something he could act on at a glance — perhaps he needed a reminder of what
 * it was telling him.
 *
 * A record that needs a reminder is not at a glance, which is the defect this
 * whole line of work exists to remove. The missing piece is the interpretation:
 * `opened: 0` is correct on a Wednesday and a failure on Monday at 15:30, and
 * nothing in the numbers says which.
 *
 * So the tick says why nothing was due, in the words a person would use.
 */

import { describe, expect, it } from 'vitest';

import { SKIP_REASONS } from '@/lib/services/tick-reasons';
import { summariseTick } from '@/lib/services/tick-summary';

describe('a tick that did something', () => {
  it('leads with what changed', () => {
    const line = summariseTick({
      opened: 1,
      closed: 0,
      materialised: 0,
      prompts: 3,
      reasons: {},
    });

    expect(line).toMatch(/opened 1 check/i);
  });

  it('says how many people were prompted, since that is the point of opening one', () => {
    const line = summariseTick({ opened: 1, closed: 0, materialised: 0, prompts: 3, reasons: {} });

    expect(line).toMatch(/3 members/i);
  });

  it('counts in words a person would use, not field names', () => {
    const line = summariseTick({ opened: 0, closed: 1, materialised: 1, prompts: 0, reasons: {} });

    expect(line).toMatch(/closed 1 check/i);
    expect(line).toMatch(/computed results for 1/i);
    expect(line).not.toMatch(/materialised/i);
  });

  it('reads as one sentence rather than a list of clauses', () => {
    const line = summariseTick({ opened: 1, closed: 1, materialised: 1, prompts: 2, reasons: {} });

    expect(line.split('. ').length).toBeLessThanOrEqual(2);
    expect(line).toMatch(/\.$/);
  });
});

describe('a tick that did nothing', () => {
  it('says so, and says why', () => {
    /*
     * The case the sentence exists for. Six days a week this is the correct
     * outcome, and on the seventh it is a failure — and the numbers alone
     * cannot tell the two apart.
     */
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { 'outside the collection window': 1 },
    });

    expect(line).toMatch(/nothing was due/i);
    expect(line).toMatch(/outside the collection window/i);
  });

  it('names the reason that actually applies, not a generic one', () => {
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { 'no schedule configured': 1 },
    });

    expect(line).toMatch(/no schedule configured/i);
  });

  it('counts the teams each reason applied to, when there are several', () => {
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { 'outside the collection window': 2, 'no schedule configured': 1 },
    });

    expect(line).toMatch(/2 teams outside the collection window/i);
    expect(line).toMatch(/1 team with no schedule configured/i);
  });

  it('puts the commonest reason first, since that is the state of the system', () => {
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { 'no schedule configured': 1, 'a check is already collecting': 5 },
    });

    expect(line.indexOf('already collecting')).toBeLessThan(line.indexOf('no schedule'));
  });

  it('says there was nothing to look at when there are no teams at all', () => {
    // Not "nothing was due": there was nothing to be due
    const line = summariseTick({ opened: 0, closed: 0, materialised: 0, prompts: 0, reasons: {} });

    expect(line).toMatch(/no teams/i);
  });
});

describe('a tick that did something and passed over others', () => {
  it('leads with what it did and still says what it passed over', () => {
    const line = summariseTick({
      opened: 1,
      closed: 0,
      materialised: 0,
      prompts: 4,
      reasons: { 'a check is already collecting': 2 },
    });

    expect(line).toMatch(/opened 1 check/i);
    expect(line).toMatch(/already collecting/i);
  });
});

describe('every reason reads as English', () => {
  /*
   * The first version composed `${count} ${reason}` and produced "Passed over
   * 2 a check is already collecting." The reasons were written to be read
   * alone in a log line, and pasting a number in front of one does not make a
   * phrase.
   *
   * So each has a phrase that follows a count, and the type makes a new
   * reason without one a compile error rather than a sentence nobody reads
   * closely enough to notice.
   */

  it.each(SKIP_REASONS)('reads after a count: %s', reason => {
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { [reason]: 2 },
    });

    expect(line).toMatch(/nothing was due: 2 teams /);
  });

  it('agrees in number, because one team is not "1 teams"', () => {
    const line = summariseTick({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
      reasons: { 'no schedule configured': 1 },
    });

    expect(line).toMatch(/1 team with no schedule/);
    expect(line).not.toMatch(/1 teams/);
  });

  it('says what it passed over in the same words when it also did something', () => {
    const line = summariseTick({
      opened: 1,
      closed: 0,
      materialised: 0,
      prompts: 5,
      reasons: { 'a check is already collecting': 2 },
    });

    expect(line).toMatch(/passed over 2 teams already collecting/i);
  });
});

describe('what the sentence never contains', () => {
  it('carries no answer content, since it goes to a third party’s dashboard', () => {
    const line = summariseTick({
      opened: 1,
      closed: 1,
      materialised: 3,
      prompts: 9,
      reasons: { 'outside the collection window': 1 },
    });

    expect(line).not.toMatch(/score|trend|improving|declining/i);
  });
});
