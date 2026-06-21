/**
 * Schedule configuration service.
 * Requirements: 3.1, 3.2, 3.11
 */

import type { TeamScheduleRepository } from '@/lib/repositories/types';
import type { TeamSchedule } from '@/lib/repositories/entities';
import { scheduleSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';

export interface ScheduleServiceDeps {
  teamScheduleRepo: TeamScheduleRepository;
}

export interface ConfigureResult {
  schedule: TeamSchedule;
  warning?: string;
}

const MINUTES_IN_DAY = 24 * 60;
const MINUTES_IN_WEEK = 7 * MINUTES_IN_DAY;

/**
 * Converts a day/time pair to minutes from the start of the week (Sunday 00:00).
 */
function toMinutesFromWeekStart(day: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return day * MINUTES_IN_DAY + hours * 60 + minutes;
}

/**
 * Calculates the session duration in minutes, handling week wrap-around.
 */
function calculateDurationMinutes(
  openDay: number,
  openTime: string,
  closeDay: number,
  closeTime: string
): number {
  const openMinutes = toMinutesFromWeekStart(openDay, openTime);
  const closeMinutes = toMinutesFromWeekStart(closeDay, closeTime);

  if (closeMinutes > openMinutes) {
    return closeMinutes - openMinutes;
  }
  // Wrap-around: close is in the next week cycle
  return MINUTES_IN_WEEK - openMinutes + closeMinutes;
}

/**
 * Factory function for creating the schedule service.
 */
export function createScheduleService(deps: ScheduleServiceDeps) {
  const { teamScheduleRepo } = deps;

  async function configure(
    teamId: string,
    schedule: {
      cadence: string;
      openDay: number;
      openTime: string;
      closeDay: number;
      closeTime: string;
      timezone?: string;
    }
  ): Promise<ConfigureResult> {
    // 1. Validate schedule using scheduleSchema
    const parsed = scheduleSchema.safeParse(schedule);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError(fields);
    }

    const validated = parsed.data;

    // 2. Store schedule (create or update)
    const existing = await teamScheduleRepo.findByTeamId(teamId);
    let stored: TeamSchedule;

    if (existing) {
      stored = await teamScheduleRepo.update(teamId, {
        cadence: validated.cadence,
        openDay: validated.openDay,
        openTime: validated.openTime,
        closeDay: validated.closeDay,
        closeTime: validated.closeTime,
        timezone: validated.timezone,
      });
    } else {
      stored = await teamScheduleRepo.create({
        teamId,
        cadence: validated.cadence,
        openDay: validated.openDay,
        openTime: validated.openTime,
        closeDay: validated.closeDay,
        closeTime: validated.closeTime,
        timezone: validated.timezone,
      });
    }

    // 3. Calculate duration and check if < 24 hours
    const durationMinutes = calculateDurationMinutes(
      validated.openDay,
      validated.openTime,
      validated.closeDay,
      validated.closeTime
    );

    const result: ConfigureResult = { schedule: stored };

    // 4. If duration < 24 hours, include warning about closing reminder suppression
    if (durationMinutes < MINUTES_IN_DAY) {
      result.warning =
        'Session duration is less than 24 hours. The closing reminder will be suppressed for sessions of this length.';
    }

    return result;
  }

  return { configure };
}
