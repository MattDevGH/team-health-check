/**
 * Naming the three silences.
 *
 * Requirements: Explaining Itself 1.4
 * Properties: 1, 2
 *
 * A closed check shows no score for one of three reasons, and the dashboard
 * rendered all three as the same blankness:
 *
 * - the aggregates have not been computed yet, which resolves in minutes
 * - the value is suppressed for anonymity, which never resolves
 * - nobody answered that theme
 *
 * A reader who cannot tell them apart cannot tell a working tool from a broken
 * one — and one of them fixes itself if you wait five minutes while another will
 * still be there next year.
 */

import { describe, expect, it } from 'vitest';

import { resultState, MATERIALISATION_GRACE_MS } from './result-state';

const CLOSED = '2026-09-14T19:20:00.000Z';
const justAfterClose = new Date('2026-09-14T19:21:00.000Z');
const longAfterClose = new Date('2026-09-14T21:00:00.000Z');

const average = (responseCount: number) => ({
  questionId: 'q-delivering-value',
  averageScore: 3,
  responseCount,
});

describe('resultState', () => {
  it('shows a value that is available', () => {
    const state = resultState({
      average: average(5),
      sessionHasAnyAggregates: true,
      closedAt: CLOSED,
      now: longAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('shown');
  });

  it('calls it pending when nothing has been computed and the close was recent', () => {
    const state = resultState({
      average: undefined,
      sessionHasAnyAggregates: false,
      closedAt: CLOSED,
      now: justAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('pending');
  });

  it('stops calling it pending once the grace period has passed', () => {
    /*
     * Nothing records whether materialisation ran, so "not computed yet" and
     * "computed and found nothing" are the same absence in the data. Time is
     * the only thing separating them: the quiet period is 30 seconds and ticks
     * are minutes apart, so beyond the grace window the honest reading is that
     * nobody answered.
     */
    const state = resultState({
      average: undefined,
      sessionHasAnyAggregates: false,
      closedAt: CLOSED,
      now: longAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('unanswered');
  });

  it('calls it unanswered when other themes computed and this one did not', () => {
    // Unambiguous: materialisation clearly ran, and produced nothing here
    const state = resultState({
      average: undefined,
      sessionHasAnyAggregates: true,
      closedAt: CLOSED,
      now: justAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('unanswered');
  });

  it('suppresses a value below the threshold in anonymous mode', () => {
    const state = resultState({
      average: average(1),
      sessionHasAnyAggregates: true,
      closedAt: CLOSED,
      now: longAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state).toMatchObject({ kind: 'suppressed', needed: 3 });
  });

  it('shows the same value in attributed mode, where nothing was promised', () => {
    const state = resultState({
      average: average(1),
      sessionHasAnyAggregates: true,
      closedAt: CLOSED,
      now: longAfterClose,
      anonymousMode: false,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('shown');
  });

  it('shows a value exactly at the threshold', () => {
    const state = resultState({
      average: average(3),
      sessionHasAnyAggregates: true,
      closedAt: CLOSED,
      now: longAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('shown');
  });

  it('never reports pending and suppressed at once', () => {
    // A value that exists has been computed, whatever the clock says
    const state = resultState({
      average: average(1),
      sessionHasAnyAggregates: false,
      closedAt: CLOSED,
      now: justAfterClose,
      anonymousMode: true,
      anonymityThreshold: 3,
    });

    expect(state.kind).toBe('suppressed');
  });

  it('gives the grace period a value a reader could be told', () => {
    // The message has to say how long, so the number has to be legible
    expect(MATERIALISATION_GRACE_MS).toBeGreaterThan(60_000);
    expect(MATERIALISATION_GRACE_MS).toBeLessThanOrEqual(15 * 60_000);
  });
});
