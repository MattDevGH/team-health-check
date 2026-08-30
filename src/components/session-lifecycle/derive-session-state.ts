/**
 * Derives what a delivery manager is shown about the current health check.
 * Requirements: Manager Experience 2.1, 2.3, 2.4, 2.7
 *
 * A pure function of the team's sessions and which of them have had aggregates
 * materialised, so the panel renders one known state rather than a pile of
 * conditionals.
 *
 * `awaiting_results` exists because closing a session does not compute its
 * results: `PATCH /sessions/[id]` closes it, and a scheduler tick materialises
 * the aggregates at least 30 seconds later. Without this state a manager who
 * closes a check sees an empty dashboard, which reads as nobody having
 * answered rather than as results still being prepared.
 */

import type { HealthCheckSession } from '@/lib/repositories/entities';

/** The control offered alongside the state. */
export type LifecycleControl = 'open' | 'close';

export type SessionState =
  | { status: 'collecting'; control: 'close'; session: HealthCheckSession }
  | { status: 'awaiting_results'; control: 'open'; session: HealthCheckSession }
  | { status: 'idle'; control: 'open'; lastClosed: HealthCheckSession }
  | { status: 'never_run'; control: 'open' };

/**
 * Orders closed sessions by when they closed, most recent first.
 *
 * The sessions endpoint gives no ordering guarantee, so reading the array as
 * ordered would show the wrong check. A closed session with no recorded close
 * time sorts oldest: it cannot be the latest thing that happened, and treating
 * a missing date as `0` keeps the comparison total.
 */
function byMostRecentlyClosed(a: HealthCheckSession, b: HealthCheckSession): number {
  return (b.actualCloseAt?.getTime() ?? 0) - (a.actualCloseAt?.getTime() ?? 0);
}

export function deriveSessionState(
  sessions: HealthCheckSession[],
  materialisedSessionIds: ReadonlySet<string>,
): SessionState {
  const open = sessions.find(session => session.status === 'open');
  if (open) {
    return { status: 'collecting', control: 'close', session: open };
  }

  const [latestClosed] = sessions
    .filter(session => session.status === 'closed')
    .sort(byMostRecentlyClosed);

  if (!latestClosed) {
    return { status: 'never_run', control: 'open' };
  }

  if (!materialisedSessionIds.has(latestClosed.id)) {
    return { status: 'awaiting_results', control: 'open', session: latestClosed };
  }

  return { status: 'idle', control: 'open', lastClosed: latestClosed };
}
