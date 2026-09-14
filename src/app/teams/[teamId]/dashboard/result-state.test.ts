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
    describeResultState({ kind }).text;

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
    expect(describeResultState({ kind: 'overdue' })?.tone).toBe('attention');
    expect(describeResultState({ kind: 'suppressed', needed: 3 })?.tone).toBe('attention');
    expect(describeResultState({ kind: 'pending' })?.tone).toBe('muted');
    expect(describeResultState({ kind: 'unanswered' })?.tone).toBe('muted');
  });
});
