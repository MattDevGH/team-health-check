/**
 * Why a score is not on screen.
 *
 * Requirements: Explaining Itself 1.4
 * Properties: 1, 2
 *
 * A closed check shows no score for one of three reasons, and the dashboard
 * rendered all three as the same blankness: the aggregates have not been
 * computed yet, the value is suppressed for anonymity, or nobody answered.
 *
 * One of those resolves itself in minutes and another never will, so a reader
 * who cannot tell them apart cannot tell a working tool from a broken one. This
 * decides which is which, apart from any rendering, so the rule can be read and
 * exercised as the rule it is.
 */

export interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

export interface ResultStateInput {
  /** The aggregate for this theme, if one has been computed. */
  average: SessionAverage | undefined;
  /** Whether the session has aggregates for *any* theme. */
  sessionHasAnyAggregates: boolean;
  closedAt: string;
  now: Date;
  anonymousMode: boolean;
  anonymityThreshold: number;
}

export type ResultState =
  | { kind: 'shown'; average: SessionAverage }
  | { kind: 'pending' }
  | { kind: 'suppressed'; needed: number }
  | { kind: 'unanswered' };

/**
 * How long after a close to keep saying "being prepared".
 *
 * Materialisation waits 30 seconds after close so late writes settle, then runs
 * on the next scheduler tick — minutes apart in production. Ten minutes covers a
 * missed tick without leaving a reader told to wait for something that is never
 * coming.
 *
 * It is a heuristic, and the reason one is needed is worth recording: **nothing
 * stores whether materialisation ran**, so "not computed yet" and "computed and
 * found nothing" are the same absence in the data. A `materialisedAt` on the
 * session would make the distinction exact. That is a schema change and is on
 * the roadmap rather than smuggled in here.
 */
export const MATERIALISATION_GRACE_MS = 10 * 60 * 1000;

export function resultState(input: ResultStateInput): ResultState {
  const { average, sessionHasAnyAggregates, closedAt, now, anonymousMode, anonymityThreshold } =
    input;

  /*
   * A value that exists has been computed, whatever the clock says. Checking
   * this first is what stops a recently-closed check reporting both pending and
   * suppressed for the same theme.
   */
  if (average) {
    if (anonymousMode && average.responseCount < anonymityThreshold) {
      return { kind: 'suppressed', needed: anonymityThreshold };
    }
    return { kind: 'shown', average };
  }

  /*
   * Other themes computed, this one did not — materialisation clearly ran, and
   * found nothing here. Unambiguous, and independent of the clock.
   */
  if (sessionHasAnyAggregates) {
    return { kind: 'unanswered' };
  }

  const sinceClose = now.getTime() - new Date(closedAt).getTime();
  return sinceClose < MATERIALISATION_GRACE_MS ? { kind: 'pending' } : { kind: 'unanswered' };
}
