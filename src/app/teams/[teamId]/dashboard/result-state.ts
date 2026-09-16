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
  /**
   * When the scheduler last ran, from its heartbeat.
   *
   * Requirements: Remembering What Happened 5.1, 5.2, 5.3
   *
   * `null` means it has never run — a real state with its own message, and
   * what a fresh deployment with a misconfigured `CRON_SECRET` looks like.
   * `undefined` means nothing could say either way, which keeps the old
   * wording rather than inventing a confident answer from a missing field.
   */
  schedulerLastRanAt?: Date | null;
}

/**
 * What the heartbeat says about why a result is late.
 *
 * Three cases the page used to report identically, and the reason it can stop
 * guessing: `running` means the fault is not a stopped trigger, `stalled`
 * means it is, and `never` means nothing has ever called the endpoint.
 * `unknown` is the honest answer when there is no heartbeat to read.
 */
export type SchedulerState =
  | { scheduler: 'running' }
  | { scheduler: 'stalled'; lastRanAt: Date }
  | { scheduler: 'never' }
  | { scheduler: 'unknown' };

export type ResultState =
  | { kind: 'shown'; average: SessionAverage }
  | { kind: 'pending' }
  | ({ kind: 'overdue' } & SchedulerState)
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

/**
 * The heartbeat as the trends response sends it, as this selector wants it.
 *
 * Requirements: Remembering What Happened 5.1, 5.3
 *
 * Three cases, and the middle one is easy to lose: `undefined` means the
 * response could not say and keeps the older wording, `null` means the
 * scheduler has never run and has a message of its own. Shared, because two
 * surfaces render this decision and writing the conversion twice is how they
 * start disagreeing.
 */
export function schedulerLastRanFrom(iso: string | null | undefined): Date | null | undefined {
  if (iso === undefined) return undefined;
  if (iso === null) return null;
  return new Date(iso);
}

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
  if (sinceClose < RESULTS_OVERDUE_AFTER_MS) return { kind: 'pending' };

  return { kind: 'overdue', ...schedulerState(input.schedulerLastRanAt, closedAt) };
}

/**
 * Which of the three the heartbeat describes.
 *
 * Measured against the close rather than against now: a scheduler that has run
 * since the check closed has had its chance at this session, so whatever is
 * wrong is not that nothing is calling the endpoint.
 */
function schedulerState(
  lastRanAt: Date | null | undefined,
  closedAt: string,
): SchedulerState {
  if (lastRanAt === undefined) return { scheduler: 'unknown' };
  if (lastRanAt === null) return { scheduler: 'never' };

  return lastRanAt.getTime() >= new Date(closedAt).getTime()
    ? { scheduler: 'running' }
    : { scheduler: 'stalled', lastRanAt };
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
/**
 * The reader is a delivery manager whose results have not appeared, not
 * somebody who has read this repository — so no "tick", no "heartbeat", no
 * "materialise".
 */
function describeOverdue(state: { kind: 'overdue' } & SchedulerState): string {
  switch (state.scheduler) {
    case 'running':
      // The scheduler has had its chance at this check, so whatever is wrong
      // is not a stopped trigger and the message should not point at one
      return 'Results are taking longer than expected';
    case 'stalled':
      return `Results are overdue — the scheduler has not run since ${formatWhen(state.lastRanAt)}`;
    case 'never':
      // Not "overdue", which describes a delay. This is a fresh deployment
      // whose trigger has never called the endpoint at all
      return 'The scheduler has never run — results cannot be prepared until it does';
    case 'unknown':
      // No heartbeat to read. Guessing is what this replaced, and inventing a
      // confident answer from a missing field would be a worse guess
      return 'Results are overdue — the scheduler may not be running';
  }
}

/** The locale is pinned, as everywhere else here. */
function formatWhen(at: Date): string {
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

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
       *
       * Which of the four depends on the heartbeat. Naming the scheduler when
       * the scheduler has demonstrably been running sends somebody to restart
       * a trigger that is already running, so the message only points there
       * when the heartbeat agrees.
       */
      return { text: describeOverdue(state), tone: 'attention' };
    case 'suppressed':
      return { text: `Hidden until ${state.needed} people have answered`, tone: 'attention' };
    case 'unanswered':
      return { text: 'No responses', tone: 'muted' };
  }
}
