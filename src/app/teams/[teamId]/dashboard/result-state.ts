/**
 * Why a score is not on screen.
 *
 * Requirements: Explaining Itself 1.4; Deployment 4.5
 * Properties: 1, 2
 *
 * A closed check shows no score for one of several reasons, and the dashboard
 * rendered them all as the same blankness. One resolves itself in minutes,
 * another never will, and a third means the scheduler has stopped — so a reader
 * who cannot tell them apart cannot tell a working tool from a broken one.
 *
 * Decided from `materialisedAt` rather than from elapsed time. Before that field
 * existed, "not computed yet" and "computed and found nothing" were the same
 * absence in the data and could only be guessed at from the clock — and a wrong
 * guess went in the dangerous direction, reporting that a team had ignored a
 * health check when the scheduler had simply stopped.
 */

export interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

export interface ResultStateInput {
  /** The aggregate for this theme, if one has been computed. */
  average: SessionAverage | undefined;
  /** When the session's aggregates were computed. Null means never. */
  materialisedAt: string | null;
  closedAt: string;
  now: Date;
  anonymousMode: boolean;
  anonymityThreshold: number;
}

export type ResultState =
  | { kind: 'shown'; average: SessionAverage }
  | { kind: 'pending' }
  | { kind: 'overdue' }
  | { kind: 'suppressed'; needed: number }
  | { kind: 'unanswered' };

/**
 * How long after a close results should have appeared.
 *
 * Materialisation waits 30 seconds so responses in flight at close time land
 * first, then runs on the next scheduler tick — minutes apart in production.
 * Beyond this, the honest reading is not "wait a little longer" but "something
 * is not running", which is the one message that would have surfaced a stopped
 * cron to the person who cares.
 */
export const RESULTS_OVERDUE_AFTER_MS = 15 * 60 * 1000;

export function resultState(input: ResultStateInput): ResultState {
  const { average, materialisedAt, closedAt, now, anonymousMode, anonymityThreshold } = input;

  /*
   * A value that exists has been computed, whatever else is true. Checking this
   * first is what stops a session reporting both pending and suppressed for the
   * same theme.
   */
  if (average) {
    if (anonymousMode && average.responseCount < anonymityThreshold) {
      return { kind: 'suppressed', needed: anonymityThreshold };
    }
    return { kind: 'shown', average };
  }

  /*
   * Materialisation has run and produced nothing for this theme. Exact, because
   * the session records that the work was done rather than leaving it to be
   * inferred from whether the work produced output.
   */
  if (materialisedAt) {
    return { kind: 'unanswered' };
  }

  const sinceClose = now.getTime() - new Date(closedAt).getTime();
  return sinceClose < RESULTS_OVERDUE_AFTER_MS ? { kind: 'pending' } : { kind: 'overdue' };
}

interface MaterialisationInput {
  /** The recorded time, or null for a session closed before the column existed. */
  materialisedAt: string | null;
  closedAt: string;
  /** The aggregates the session produced, whatever their subject. */
  averages: readonly { questionId: string }[];
}

/**
 * When a session's aggregates were computed, as best the data can support.
 *
 * `materialisedAt` was added after production had already closed sessions, so
 * those rows carry null while plainly having been materialised. A single
 * aggregate is proof the work ran — a value cannot exist otherwise — and using
 * it keeps unanswered themes in old sessions from reporting a stopped
 * scheduler.
 *
 * A session with neither a time nor any output gets no benefit of the doubt.
 * That case is genuinely indistinguishable from never having run, and guessing
 * at it is what the column exists to stop.
 */
export function materialisationEvidence(input: MaterialisationInput): string | null {
  if (input.materialisedAt) return input.materialisedAt;
  return input.averages.length > 0 ? input.closedAt : null;
}

export interface ResultStateMessage {
  text: string;
  /**
   * Whether a reader has anything to do about it. `attention` earns colour;
   * `muted` is news the reader cannot act on and should not be alarmed by.
   */
  tone: 'muted' | 'attention';
}

/**
 * How to say a silence, for every surface that has to say it.
 *
 * The latest-session panel and the question themes list describe the same
 * session and a reader moves straight between them, so wording that differs
 * between the two gives one fact two accounts. That happened: the list called a
 * suppressed value "insufficient data", which reads as a fault in the data
 * rather than a small team, while the panel named the threshold.
 *
 * Returns null for a value that is on screen, where the number speaks.
 */
/** Every state but `shown` has something to say, and the type says so. */
export function describeResultState(
  state: Exclude<ResultState, { kind: 'shown' }>,
): ResultStateMessage;
export function describeResultState(state: ResultState): ResultStateMessage | null;
export function describeResultState(state: ResultState): ResultStateMessage | null {
  switch (state.kind) {
    case 'shown':
      return null;
    case 'pending':
      // Bounded on purpose. "Being prepared" with no horizon is indistinguishable
      // from broken after the second refresh.
      return { text: 'Results are being prepared — this usually takes a few minutes', tone: 'muted' };
    case 'overdue':
      /*
       * Names the scheduler rather than the team. The alternative reading —
       * "no responses" — is a false accusation, and the one message that would
       * have surfaced a stopped cron to the person who could restart it.
       */
      return { text: 'Results are overdue — the scheduler may not be running', tone: 'attention' };
    case 'suppressed':
      return { text: `Hidden until ${state.needed} people have answered`, tone: 'attention' };
    case 'unanswered':
      return { text: 'No responses', tone: 'muted' };
  }
}
