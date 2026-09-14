/**
 * Scheduler service — desired state reconciliation via tick(now).
 * Requirements: 3.2, 3.3, 3.4, 3.9, NFR 4.4
 *
 * The scheduler is designed to be called periodically (e.g., every minute via cron).
 * It is idempotent: calling tick() multiple times with the same `now` is safe.
 */

import type {
  TeamRepository,
  TeamScheduleRepository,
  SessionRepository,
  SessionAggregateRepository,
} from '@/lib/repositories/types';
import type { SessionService } from '@/lib/services/session.service';
import { nextOccurrenceUtc, previousOccurrenceUtc } from '@/lib/local-time';

export interface SchedulerServiceDeps {
  teamRepo: TeamRepository;
  teamScheduleRepo: TeamScheduleRepository;
  sessionRepo: SessionRepository;
  sessionAggregateRepo: SessionAggregateRepository;
  sessionService: SessionService;
}

/** Quiet period in milliseconds before materialising aggregates after session close. */
const QUIET_PERIOD_MS = 30_000;

export function createSchedulerService(deps: SchedulerServiceDeps) {
  const { teamRepo, teamScheduleRepo, sessionRepo, sessionAggregateRepo, sessionService } = deps;

  /**
   * Desired-state reconciliation tick.
   * 1. Open due sessions
   * 2. Close due sessions
   * 3. Materialise pending aggregates (quiet period elapsed)
   *
   * Idempotent: safe to call multiple times for the same `now`.
   */
  async function tick(now: Date): Promise<void> {
    const teams = await teamRepo.list();

    for (const team of teams) {
      // Skip archived teams
      if (team.archived) continue;

      const schedule = await teamScheduleRepo.findByTeamId(team.id);
      if (!schedule) continue;

      const timezone = schedule.timezone || team.timezone || 'UTC';

      const currentSession = await sessionRepo.findOpenByTeamId(team.id);

      /*
       * Close when the session is past its close time, however far past.
       *
       * `scheduledCloseAt` is stamped when the session opens, so this reads
       * stored state rather than the clock. The old test — local time equal to
       * `closeTime` as a string — meant a tick a minute late left the session
       * open forever: still collecting, never producing results.
       *
       * No staleness bound here, deliberately. A missed close is not like a
       * missed open: the check is still gathering answers, and however late,
       * ending it is right.
       */
      if (currentSession?.scheduledCloseAt && currentSession.scheduledCloseAt <= now) {
        await sessionService.close(team.id, currentSession.id);
      }

      /*
       * Open when the current cycle has begun and nothing has served it yet.
       *
       * Asking "which cycle are we in, and has it been handled?" rather than
       * "is the clock reading 09:00?" is what makes the tick safe to miss. An
       * external cron every five minutes will almost never land on the exact
       * minute, and under the old comparison that meant the check simply never
       * opened — silently, since there is nothing exceptional about the time
       * not being 09:00.
       *
       * A session is evidence the cycle was served whether it is still open or
       * already closed, and whether the scheduler or a manager opened it. That
       * is why this looks at `actualOpenAt` across all sessions rather than at
       * a flag the scheduler sets for itself.
       */
      const sessionAfterClose = await sessionRepo.findOpenByTeamId(team.id);
      if (!sessionAfterClose) {
        const cycleOpenedAt = previousOccurrenceUtc(
          now,
          schedule.openDay,
          schedule.openTime,
          timezone,
        );
        const cycleClosesAt = nextOccurrenceUtc(
          cycleOpenedAt,
          schedule.closeDay,
          schedule.closeTime,
          timezone,
        );

        /*
         * Past the close time the collection window is gone, and opening then
         * serves nobody: it would create a session immediately overdue for
         * closing and prompt a team after the fact. A trigger down for a week
         * costs that week, and says so by leaving no session, rather than
         * quietly producing a misdated one.
         */
        const withinCollectionWindow = now >= cycleOpenedAt && now < cycleClosesAt;

        const sessions = await sessionRepo.findByTeamId(team.id);
        const cycleAlreadyServed = sessions.some(
          session => session.actualOpenAt && session.actualOpenAt >= cycleOpenedAt,
        );

        if (withinCollectionWindow && !cycleAlreadyServed) {
          await sessionService.open(team.id, 'system');
        }
      }
    }

    // Materialise aggregates for sessions closed beyond the quiet period
    await materialisePendingAggregates(now);
  }

  /**
   * Finds closed sessions that haven't been materialised yet and whose
   * quiet period (30s) has elapsed, then triggers materialisation.
   */
  async function materialisePendingAggregates(now: Date): Promise<void> {
    const teams = await teamRepo.list();

    for (const team of teams) {
      const sessions = await sessionRepo.findByTeamId(team.id);

      for (const session of sessions) {
        if (session.status !== 'closed') continue;
        if (!session.actualCloseAt) continue;

        // Check quiet period has elapsed
        const elapsed = now.getTime() - session.actualCloseAt.getTime();
        if (elapsed < QUIET_PERIOD_MS) continue;

        // Skip sessions that already have aggregates (idempotent)
        const existing = await sessionAggregateRepo.findBySessionId(session.id);
        if (existing.length > 0) continue;

        // Attempt materialisation — safe to call; errors are swallowed
        // (e.g., already materialised or no responses).
        try {
          await sessionService.materializeAggregates(session.id);
        } catch {
          // Materialisation failure is non-fatal; will be retried on next tick
        }
      }
    }
  }

  return { tick };
}
