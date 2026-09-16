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
} from '@/lib/repositories/types';
import type { SessionService } from '@/lib/services/session.service';
import { nextOccurrenceUtc, previousOccurrenceUtc } from '@/lib/local-time';
import type { Recorder } from '@/lib/observability';

export interface SchedulerServiceDeps {
  teamRepo: TeamRepository;
  teamScheduleRepo: TeamScheduleRepository;
  sessionRepo: SessionRepository;
  sessionService: SessionService;
  /**
   * Optional, so the scripts and tests with no interest in records are not
   * made to carry one. Production wires the real recorder in.
   */
  recorder?: Recorder;
  /** Injectable so a test can assert the id rather than match a pattern. */
  newTickId?: () => string;
}

/** What a tick did, for the caller and for the cron service that shows it. */
export interface TickSummary {
  tickId: string;
  opened: number;
  closed: number;
  materialised: number;
  durationMs: number;
}

/** Quiet period in milliseconds before materialising aggregates after session close. */
const QUIET_PERIOD_MS = 30_000;

export function createSchedulerService(deps: SchedulerServiceDeps) {
  const { teamRepo, teamScheduleRepo, sessionRepo, sessionService } = deps;

  /*
   * A recorder that writes nothing, when none was supplied.
   *
   * Cheaper than a null check at every call site, and it keeps the recording
   * lines reading as statements about what happened rather than as
   * conditionals about whether anyone is listening.
   */
  const record: Recorder = deps.recorder ?? {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const newTickId = deps.newTickId ?? (() => Math.random().toString(36).slice(2, 10));

  /**
   * Desired-state reconciliation tick.
   * 1. Open due sessions
   * 2. Close due sessions
   * 3. Materialise pending aggregates (quiet period elapsed)
   *
   * Idempotent: safe to call multiple times for the same `now`.
   */
  async function tick(now: Date): Promise<TickSummary> {
    const tickId = newTickId();
    const startedAt = Date.now();
    let opened = 0;
    let closed = 0;

    record.info('tick.started', { tickId });

    const teams = await teamRepo.list();

    for (const team of teams) {
      if (team.archived) {
        record.info('tick.skipped', { tickId, teamId: team.id, reason: 'team archived' });
        continue;
      }

      const schedule = await teamScheduleRepo.findByTeamId(team.id);
      if (!schedule) {
        /*
         * The reason that matters most. A tick which opens nothing is the
         * normal state six days a week, and without a reason it reads
         * exactly like a broken one — which is the confusion the dashboard’s
         * "the scheduler may not be running" exists to paper over.
         */
        record.info('tick.skipped', {
          tickId,
          teamId: team.id,
          reason: 'no schedule configured',
        });
        continue;
      }

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
        closed += 1;
        record.info('session.closed', {
          tickId,
          teamId: team.id,
          sessionId: currentSession.id,
        });
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
          const session = await sessionService.open(team.id, 'system');
          opened += 1;
          record.info('session.opened', {
            tickId,
            teamId: team.id,
            sessionId: session.id,
          });
        } else {
          /*
           * Two different silences, told apart. Outside the window means the
           * cycle has passed and opening now would prompt a team after the
           * fact; already served means it ran and this is simply a later tick
           * in the same week.
           */
          record.info('tick.skipped', {
            tickId,
            teamId: team.id,
            reason: withinCollectionWindow
              ? 'this cycle has already been served'
              : 'outside the collection window',
          });
        }
      } else {
        record.info('tick.skipped', {
          tickId,
          teamId: team.id,
          reason: 'a check is already collecting',
          sessionId: sessionAfterClose.id,
        });
      }
    }

    // Materialise aggregates for sessions closed beyond the quiet period
    const materialised = await materialisePendingAggregates(now, tickId);

    const durationMs = Date.now() - startedAt;
    record.info('tick.finished', { tickId, opened, closed, materialised, durationMs });

    return { tickId, opened, closed, materialised, durationMs };
  }

  /**
   * Finds closed sessions that haven't been materialised yet and whose
   * quiet period (30s) has elapsed, then triggers materialisation.
   */
  async function materialisePendingAggregates(now: Date, tickId: string): Promise<number> {
    let materialised = 0;
    const teams = await teamRepo.list();

    for (const team of teams) {
      const sessions = await sessionRepo.findByTeamId(team.id);

      for (const session of sessions) {
        if (session.status !== 'closed') continue;
        if (!session.actualCloseAt) continue;

        // Check quiet period has elapsed
        const elapsed = now.getTime() - session.actualCloseAt.getTime();
        if (elapsed < QUIET_PERIOD_MS) continue;

        /*
         * Skip what has already been done, rather than what produced output.
         *
         * This tested `aggregates.length > 0`, which a check nobody answered
         * never satisfies — so every tick re-materialised every empty session
         * for as long as it existed.
         */
        if (session.materialisedAt) continue;

        // Attempt materialisation — safe to call; errors are swallowed
        // (e.g., already materialised or no responses).
        try {
          await sessionService.materializeAggregates(session.id);
          materialised += 1;
          record.info('session.materialised', {
            tickId,
            teamId: team.id,
            sessionId: session.id,
          });
        } catch (error) {
          /*
           * Non-fatal, and retried on the next tick — which is right, and was
           * silent. A permanent cause was retried for ever with nobody able
           * to see it happening.
           */
          record.error('session.materialise.failed', {
            tickId,
            teamId: team.id,
            sessionId: session.id,
            errorName: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return materialised;
  }

  return { tick };
}
