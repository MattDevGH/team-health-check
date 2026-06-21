/**
 * Schedule service unit tests.
 * Requirements: 3.1, 3.2, 3.11
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createScheduleService } from '@/lib/services/schedule.service';

describe('ScheduleService.configure', () => {
  let repos: Repositories;
  let scheduleService: ReturnType<typeof createScheduleService>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    scheduleService = createScheduleService({
      teamScheduleRepo: repos.teamSchedule,
    });
  });

  it('saves a schedule and makes it retrievable by teamId', async () => {
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });

    expect(result.schedule).toBeDefined();
    expect(result.schedule.teamId).toBe('team-1');
    expect(result.schedule.cadence).toBe('weekly');
    expect(result.schedule.openDay).toBe(1);
    expect(result.schedule.openTime).toBe('09:00');
    expect(result.schedule.closeDay).toBe(5);
    expect(result.schedule.closeTime).toBe('17:00');

    // Verify it can be retrieved
    const stored = await repos.teamSchedule.findByTeamId('team-1');
    expect(stored).not.toBeNull();
    expect(stored!.openDay).toBe(1);
    expect(stored!.closeTime).toBe('17:00');
  });

  it('defaults timezone to Europe/London when not specified', async () => {
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });

    expect(result.schedule.timezone).toBe('Europe/London');
  });

  it('uses provided timezone when specified', async () => {
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'America/New_York',
    });

    expect(result.schedule.timezone).toBe('America/New_York');
  });

  it('warns when session duration is less than 24 hours', async () => {
    // Same day: Monday 09:00 to Monday 17:00 = 8 hours
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 1,
      closeTime: '17:00',
    });

    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/closing reminder/i);
  });

  it('does not warn when session duration is exactly 24 hours', async () => {
    // Monday 09:00 to Tuesday 09:00 = exactly 24 hours
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 2,
      closeTime: '09:00',
    });

    expect(result.warning).toBeUndefined();
  });

  it('does not warn when session duration is greater than 24 hours', async () => {
    // Monday 09:00 to Friday 17:00 = ~104 hours
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });

    expect(result.warning).toBeUndefined();
  });

  it('handles wrap-around when closeDay is before openDay', async () => {
    // Friday 09:00 to Monday 17:00 (wraps around weekend) = ~80 hours
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 5,
      openTime: '09:00',
      closeDay: 1,
      closeTime: '17:00',
    });

    expect(result.warning).toBeUndefined();
  });

  it('warns on wrap-around when duration is less than 24 hours', async () => {
    // Saturday 22:00 to Sunday 06:00 = 8 hours (wrap-around short)
    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 6,
      openTime: '22:00',
      closeDay: 0,
      closeTime: '06:00',
    });

    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/closing reminder/i);
  });

  it('updates existing schedule when called again for same team', async () => {
    await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
    });

    const result = await scheduleService.configure('team-1', {
      cadence: 'weekly',
      openDay: 2,
      openTime: '10:00',
      closeDay: 4,
      closeTime: '16:00',
      timezone: 'US/Eastern',
    });

    expect(result.schedule.openDay).toBe(2);
    expect(result.schedule.openTime).toBe('10:00');
    expect(result.schedule.closeDay).toBe(4);
    expect(result.schedule.closeTime).toBe('16:00');
    expect(result.schedule.timezone).toBe('US/Eastern');
  });
});
