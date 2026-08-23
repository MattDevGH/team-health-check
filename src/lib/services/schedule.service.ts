/**
 * Schedule configuration service.
 * Requirements: 3.1, 3.2, 3.11, 18.1, 18.2
 */

import { ValidationError } from '@/lib/errors';
import type { TeamSchedule } from '@/lib/repositories/entities';
import type { TeamScheduleRepository } from '@/lib/repositories/types';
import { scheduleSchema } from '@/lib/validation/schemas';

export interface ScheduleServiceDeps {
  teamScheduleRepo: TeamScheduleRepository;
}

export interface ConfigureResult {
  schedule: TeamSchedule;
  warning?: string;
}

interface ScheduleInput {
  cadence: string;
  openDay: number;
  openTime: string;
  closeDay: number;
  closeTime: string;
  timezone?: string;
}

type ScheduleSnapshot = Pick<
  TeamSchedule,
  'cadence' | 'openDay' | 'openTime' | 'closeDay' | 'closeTime' | 'timezone'
>;

const MINUTES_IN_DAY = 24 * 60;
const MINUTES_IN_WEEK = 7 * MINUTES_IN_DAY;

function toMinutesFromWeekStart(day: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return day * MINUTES_IN_DAY + hours * 60 + minutes;
}

function calculateDurationMinutes(schedule: ScheduleSnapshot): number {
  const openMinutes = toMinutesFromWeekStart(schedule.openDay, schedule.openTime);
  const closeMinutes = toMinutesFromWeekStart(schedule.closeDay, schedule.closeTime);
  return closeMinutes > openMinutes
    ? closeMinutes - openMinutes
    : MINUTES_IN_WEEK - openMinutes + closeMinutes;
}

function toSnapshot(schedule: ScheduleSnapshot): ScheduleSnapshot {
  return {
    cadence: schedule.cadence,
    openDay: schedule.openDay,
    openTime: schedule.openTime,
    closeDay: schedule.closeDay,
    closeTime: schedule.closeTime,
    timezone: schedule.timezone,
  };
}

function buildResult(schedule: TeamSchedule): ConfigureResult {
  const result: ConfigureResult = { schedule };
  if (calculateDurationMinutes(toSnapshot(schedule)) < MINUTES_IN_DAY) {
    result.warning =
      'Session duration is less than 24 hours. The closing reminder will be suppressed for sessions of this length.';
  }
  return result;
}

/** Factory function for creating the schedule service. */
export function createScheduleService(deps: ScheduleServiceDeps) {
  const { teamScheduleRepo } = deps;

  async function configure(
    teamId: string,
    schedule: ScheduleInput,
    actorId: string,
  ): Promise<ConfigureResult> {
    const parsed = scheduleSchema.safeParse(schedule);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })));
    }

    const nextSnapshot = toSnapshot(parsed.data);
    const existing = await teamScheduleRepo.findByTeamId(teamId);
    const previousSnapshot = existing ? toSnapshot(existing) : null;
    if (existing && previousSnapshot
      && JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
      return buildResult(existing);
    }

    const audit = {
      changeType: 'schedule_change',
      previousValue: previousSnapshot ? JSON.stringify(previousSnapshot) : 'null',
      newValue: JSON.stringify(nextSnapshot),
      userId: actorId,
    };
    const stored = await teamScheduleRepo.saveWithAudit(
      { teamId, ...nextSnapshot },
      audit,
    );

    return buildResult(stored);
  }

  return { configure };
}
