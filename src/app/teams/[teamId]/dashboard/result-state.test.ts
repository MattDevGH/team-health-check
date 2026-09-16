/**
 * Naming the silences.
 *
 * Requirements: Explaining Itself 1.4; Deployment 4.5
 * Properties: 1, 2
 *
 * A closed check shows no score for one of several reasons, and the dashboard
 * rendered them all as the same blankness:
 *
 * - not computed yet, which resolves in minutes
 * - not computed and overdue, which means the scheduler has stopped
 * - suppressed for anonymity, which never resolves
 * - nobody answered that theme
 *
 * The first two and the last were indistinguishable in the data until
 * `materialisedAt` existed. Guessing between them from elapsed time went wrong
 * in the dangerous direction: a stalled scheduler would have the dashboard
 * report that a team ignored a health check they were never asked about.
 */

import { describe, expect, it } from 'vitest';

import {
  describeResultState,
  materialisationEvidence,
  resultState,
  RESULTS_OVERDUE_AFTER_MS,
} from './result-state';

const CLOSED = '2026-09-14T19:20:00.000Z';
const soonAfter = new Date('2026-09-14T19:22:00.000Z');
const longAfter = new Date('2026-09-14T21:00:00.000Z');

const average = (responseCount: number) => ({
  questionId: 'q-delivering-value',
  averageScore: 3,
  responseCount,
});

const base = {
  closedAt: CLOSED,
  anonymousMode: true,
  anonymityThreshold: 3,
};

describe('resultState', () => {
  it('shows a value that is available', () => {
    const state = resultState({
      ...base,
      average: average(5),
      materialisedAt: CLOSED,
      now: longAfter,
    });

    expect(state.kind).toBe('shown');
  });

  it('calls it pending when nothing has been computed and the close was recent', () => {
    const state = resultState({
      ...base,
      average: undefined,
      materialisedAt: null,
      now: soonAfter,
    });

    expect(state.kind).toBe('pending');
  });

  it('calls it overdue rather than blaming the team when results never arrived', () => {
    /*
     * The case the whole field exists for. Guessing from the clock alone, this
     * read as "nobody answered" — a false claim about a team, made confidently,
     * when the truth was that the scheduler had stopped.
     */
    const state = resultState({
      ...base,
      average: undefined,
      materialisedAt: null,
      now: longAfter,
    });

    expect(state.kind).toBe('overdue');
  });

  it('calls it unanswered only when materialisation actually ran', () => {
    const state = resultState({
      ...base,
      average: undefined,
      materialisedAt: '2026-09-14T19:21:00.000Z',
      now: longAfter,
    });

    expect(state.kind).toBe('unanswered');
  });

  it('never reports unanswered for a session that was never materialised', () => {
    // However long ago it closed. Absence of output is not evidence of absence
    // of answers.
    for (const now of [soonAfter, longAfter, new Date('2027-01-01T00:00:00.000Z')]) {
      const state = resultState({ ...base, average: undefined, materialisedAt: null, now });
      expect(state.kind).not.toBe('unanswered');
    }
  });

  it('suppresses a value below the threshold in anonymous mode', () => {
    const state = resultState({
      ...base,
      average: average(1),
      materialisedAt: CLOSED,
      now: longAfter,
    });

    expect(state).toMatchObject({ kind: 'suppressed', needed: 3 });
  });

  it('shows the same value in attributed mode, where nothing was promised', () => {
    const state = resultState({
      ...base,
      anonymousMode: false,
      average: average(1),
      materialisedAt: CLOSED,
      now: longAfter,
    });

    expect(state.kind).toBe('shown');
  });

  it('shows a value exactly at the threshold', () => {
    const state = resultState({
      ...base,
      average: average(3),
      materialisedAt: CLOSED,
      now: longAfter,
    });

    expect(state.kind).toBe('shown');
  });

  it('never reports pending and suppressed at once', () => {
    // A value that exists has been computed, whatever materialisedAt says
    const state = resultState({
      ...base,
      average: average(1),
      materialisedAt: null,
      now: soonAfter,
    });

    expect(state.kind).toBe('suppressed');
  });

  it('gives the overdue threshold a value a reader could be told', () => {
    expect(RESULTS_OVERDUE_AFTER_MS).toBeGreaterThan(60_000);
    expect(RESULTS_OVERDUE_AFTER_MS).toBeLessThanOrEqual(60 * 60_000);
  });
});

/**
 * Sessions that closed before the column existed.
 *
 * `materialisedAt` was added on 2026-09-14, after production had already closed
 * sessions and computed their aggregates. Those rows carry null, and reading
 * null as "never materialised" would make every unanswered theme in them report
 * a stopped scheduler — the same false alarm, pointed the other way.
 */
describe('materialisationEvidence', () => {
  const anAverage = { questionId: 'q-delivering-value', averageScore: 3, responseCount: 6 };

  it('uses the recorded time when the session has one', () => {
    expect(
      materialisationEvidence({ materialisedAt: CLOSED, closedAt: CLOSED, averages: [] }),
    ).toBe(CLOSED);
  });

  it('treats an aggregate as proof the work ran, for a session that predates the column', () => {
    // A value cannot exist unless materialisation produced it
    expect(
      materialisationEvidence({ materialisedAt: null, closedAt: CLOSED, averages: [anAverage] }),
    ).toBe(CLOSED);
  });

  it('claims nothing for a session with neither a time nor any output', () => {
    // Indistinguishable from never having run, and guessing here is what the
    // column was added to stop
    expect(
      materialisationEvidence({ materialisedAt: null, closedAt: CLOSED, averages: [] }),
    ).toBeNull();
  });

  it('prefers the recorded time over the close, so the two are not conflated', () => {
    const ran = '2026-09-14T19:25:00.000Z';
    expect(
      materialisationEvidence({ materialisedAt: ran, closedAt: CLOSED, averages: [anAverage] }),
    ).toBe(ran);
  });
});

/**
 * One wording, two surfaces.
 *
 * The latest-session panel and the question themes list describe the same
 * session, and a reader moves straight from one to the other. If they word the
 * same state differently — "insufficient data" against "hidden until 3 people
 * have answered" — the reader has two accounts of one fact and no way to tell
 * which is true. They did, until this existed.
 */
describe('describeResultState', () => {
  const message = (kind: 'pending' | 'overdue' | 'unanswered') =>
    describeResultState(
      // The overdue message now depends on what the heartbeat says. These
      // cases predate that and assert the wording used when nothing can say,
      // which is the one they were written against.
      kind === 'overdue' ? { kind, scheduler: 'unknown' } : { kind },
    ).text;

  it('bounds the wait for a pending result rather than leaving it open', () => {
    expect(message('pending')).toMatch(/minutes/i);
  });

  it('points an overdue result at the scheduler, not at the team', () => {
    expect(message('overdue')).toMatch(/scheduler/i);
    expect(message('overdue')).not.toMatch(/no responses/i);
  });

  it('says plainly that nobody answered', () => {
    expect(message('unanswered')).toMatch(/no responses/i);
  });

  it('says what would make a suppressed value appear', () => {
    // Not "insufficient data": the data is fine, the team is small
    const text = describeResultState({ kind: 'suppressed', needed: 3 }).text;
    expect(text).toMatch(/hidden until 3 people have answered/i);
  });

  it('describes nothing for a value that is on screen', () => {
    expect(describeResultState({ kind: 'shown', average: average(6) })).toBeNull();
  });

  it('gives every silent state a distinct wording', () => {
    const texts = [message('pending'), message('overdue'), message('unanswered')];
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('marks the states a reader should act on, and not the ones they cannot', () => {
    // Drives colour on both surfaces. Overdue and suppressed have something a
    // reader can do; a pending result and an unanswered theme do not.
    expect(describeResultState({ kind: 'overdue', scheduler: 'unknown' })?.tone).toBe('attention');
    expect(describeResultState({ kind: 'suppressed', needed: 3 })?.tone).toBe('attention');
    expect(describeResultState({ kind: 'pending' })?.tone).toBe('muted');
    expect(describeResultState({ kind: 'unanswered' })?.tone).toBe('muted');
  });
});

describe('an overdue result, once the scheduler can be asked', () => {
  /*
   * Requirements: Remembering What Happened 5.1, 5.2, 5.3, 5.4
   *
   * "Results are overdue — the scheduler may not be running" was a guess made
   * from fifteen minutes of silence, and a reasonable one while there was
   * nothing to ask. There is now: every tick writes a heartbeat, so the page
   * can tell three cases apart that it used to report identically.
   *
   * The third is not hypothetical. A fresh deployment with a misconfigured
   * CRON_SECRET has a scheduler that has never run, and "overdue" is an
   * actively misleading thing to say about it — it points at a delay when the
   * fault is that nothing is calling the endpoint at all.
   */

  const overdueInput = {
    ...base,
    average: undefined,
    materialisedAt: null,
    now: longAfter,
  };

  it('says the scheduler is running when it has ticked since the close', () => {
    // Then the fault is not a stopped trigger, and saying it might be sends
    // somebody to look at the wrong thing
    const state = resultState({
      ...overdueInput,
      schedulerLastRanAt: new Date(new Date(CLOSED).getTime() + 60_000),
    });

    expect(state).toMatchObject({ kind: 'overdue', scheduler: 'running' });
  });

  it('says when it last ran, if that was before the close', () => {
    const lastRan = new Date(new Date(CLOSED).getTime() - 60_000);

    const state = resultState({ ...overdueInput, schedulerLastRanAt: lastRan });

    expect(state).toMatchObject({ kind: 'overdue', scheduler: 'stalled', lastRanAt: lastRan });
  });

  it('says it has never run, rather than reporting an absence as a delay', () => {
    const state = resultState({ ...overdueInput, schedulerLastRanAt: null });

    expect(state).toMatchObject({ kind: 'overdue', scheduler: 'never' });
  });

  it('keeps the old wording when nothing can say either way', () => {
    /*
     * A trends response that predates the heartbeat, or one that could not be
     * read. Guessing is what this milestone removes, and inventing a
     * confident answer from a missing field would be a worse guess than the
     * one already there.
     */
    const state = resultState(overdueInput);

    expect(state).toMatchObject({ kind: 'overdue', scheduler: 'unknown' });
  });

  it('changes nothing about the states that were never guesses', () => {
    // Requirement 5 is about the overdue message. A heartbeat must not make a
    // computed value pending, or a pending one overdue
    const shown = resultState({
      ...base,
      average: average(5),
      materialisedAt: CLOSED,
      now: longAfter,
      schedulerLastRanAt: null,
    });
    const pending = resultState({
      ...base,
      average: undefined,
      materialisedAt: null,
      now: soonAfter,
      schedulerLastRanAt: null,
    });

    expect(shown.kind).toBe('shown');
    expect(pending.kind).toBe('pending');
  });
});

describe('what an overdue result says once the scheduler can be asked', () => {
  const lastRan = new Date('2026-09-14T09:05:00.000Z');

  it('stops naming the scheduler when the scheduler has been running', () => {
    // The old wording sends somebody to restart a trigger that is already
    // running, which is the wrong half of the system to look at
    const text = describeResultState({ kind: 'overdue', scheduler: 'running' }).text;

    expect(text).not.toMatch(/scheduler/i);
    expect(text).toMatch(/overdue|late|longer than expected/i);
  });

  it('says when the scheduler last ran, so the reader knows how long', () => {
    const text = describeResultState({
      kind: 'overdue',
      scheduler: 'stalled',
      lastRanAt: lastRan,
    }).text;

    expect(text).toMatch(/scheduler/i);
    expect(text).toMatch(/14 September 2026/);
  });

  it('says plainly when the scheduler has never run', () => {
    const text = describeResultState({ kind: 'overdue', scheduler: 'never' }).text;

    expect(text).toMatch(/never/i);
    expect(text).not.toMatch(/overdue/i);
  });

  it('keeps the old wording when nothing is known', () => {
    expect(describeResultState({ kind: 'overdue', scheduler: 'unknown' }).text).toMatch(
      /scheduler may not be running/i,
    );
  });

  it('asks a reader to act on every one of them', () => {
    for (const state of [
      { kind: 'overdue', scheduler: 'running' },
      { kind: 'overdue', scheduler: 'stalled', lastRanAt: lastRan },
      { kind: 'overdue', scheduler: 'never' },
      { kind: 'overdue', scheduler: 'unknown' },
    ] as const) {
      expect(describeResultState(state).tone).toBe('attention');
    }
  });

  it('never makes the reader know what a tick is', () => {
    // Requirement 5.4. The audience is a delivery manager whose results have
    // not appeared, not somebody who has read this repository
    for (const state of [
      { kind: 'overdue', scheduler: 'running' },
      { kind: 'overdue', scheduler: 'stalled', lastRanAt: lastRan },
      { kind: 'overdue', scheduler: 'never' },
    ] as const) {
      expect(describeResultState(state).text).not.toMatch(/tick|heartbeat|materialis/i);
    }
  });

  it('gives each of them a distinct wording', () => {
    const texts = [
      describeResultState({ kind: 'overdue', scheduler: 'running' }).text,
      describeResultState({ kind: 'overdue', scheduler: 'stalled', lastRanAt: lastRan }).text,
      describeResultState({ kind: 'overdue', scheduler: 'never' }).text,
      describeResultState({ kind: 'overdue', scheduler: 'unknown' }).text,
    ];

    expect(new Set(texts).size).toBe(texts.length);
  });
});
