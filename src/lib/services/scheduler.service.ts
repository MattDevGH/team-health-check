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

export interface SchedulerServiceDeps {
  teamRepo: TeamRepository;
  teamScheduleRepo: TeamScheduleRepository;
  sessionRepo: SessionRepository;
  sessionAggregateRepo: SessionAggregateRepository;
  sessionService: SessionService;
}

/** Quiet period in milliseconds before materialising aggregates after session close. */
const QUIET_PERIOD_MS = 30_000;

/**
 * Extracts the day of week (0=Sunday..6=Saturday) and HH:MM time string
 * from a Date, interpreted in the given IANA timezone.
 */
function getLocalDayAndTime(date: Date, timezone: string): { day: number; time: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const day = dayMap[weekdayStr] ?? 0;
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;

  return { day, time };
}

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
      const { day, time } = getLocalDayAndTime(now, timezone);

      const currentSession = await sessionRepo.findOpenByTeamId(team.id);

      // Check if it's time to close an open session
      if (currentSession && day === schedule.closeDay && time === schedule.closeTime) {
        await sessionService.close(currentSession.id);
      }

      // Check if it's time to open (and no session is currently open)
      const sessionAfterClose = await sessionRepo.findOpenByTeamId(team.id);
      if (!sessionAfterClose && day === schedule.openDay && time === schedule.openTime) {
        await sessionService.open(team.id, 'system');
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
