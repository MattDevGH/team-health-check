import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createScheduleService } from '@/lib/services/schedule.service';

const baseSchedule = {
  cadence: 'weekly',
  openDay: 1,
  openTime: '09:00',
  closeDay: 5,
  closeTime: '17:00',
};
const actorId = 'manager-1';

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
    const result = await scheduleService.configure('team-1', baseSchedule, actorId);

    expect(result.schedule).toMatchObject({ teamId: 'team-1', ...baseSchedule });
    await expect(repos.teamSchedule.findByTeamId('team-1')).resolves.toMatchObject(
      baseSchedule,
    );
  });

  it('defaults timezone to Europe/London when not specified', async () => {
    const result = await scheduleService.configure('team-1', baseSchedule, actorId);

    expect(result.schedule.timezone).toBe('Europe/London');
  });

  it('uses provided timezone when specified', async () => {
    const result = await scheduleService.configure(
      'team-1',
      { ...baseSchedule, timezone: 'America/New_York' },
      actorId,
    );

    expect(result.schedule.timezone).toBe('America/New_York');
  });

  it('warns when session duration is less than 24 hours', async () => {
    const result = await scheduleService.configure(
      'team-1',
      { ...baseSchedule, closeDay: 1, closeTime: '17:00' },
      actorId,
    );

    expect(result.warning).toMatch(/closing reminder/i);
  });

  it('does not warn when session duration is exactly 24 hours', async () => {
    const result = await scheduleService.configure(
      'team-1',
      { ...baseSchedule, closeDay: 2, closeTime: '09:00' },
      actorId,
    );

    expect(result.warning).toBeUndefined();
  });

  it('does not warn when session duration is greater than 24 hours', async () => {
    const result = await scheduleService.configure('team-1', baseSchedule, actorId);

    expect(result.warning).toBeUndefined();
  });

  it('handles wrap-around when closeDay is before openDay', async () => {
    const result = await scheduleService.configure(
      'team-1',
      { ...baseSchedule, openDay: 5, closeDay: 1 },
      actorId,
    );

    expect(result.warning).toBeUndefined();
  });

  it('warns on wrap-around when duration is less than 24 hours', async () => {
    const result = await scheduleService.configure(
      'team-1',
      {
        ...baseSchedule,
        openDay: 6,
        openTime: '22:00',
        closeDay: 0,
        closeTime: '06:00',
      },
      actorId,
    );

    expect(result.warning).toMatch(/closing reminder/i);
  });

  it('audits first configuration with a complete normalized snapshot and actor', async () => {
    await scheduleService.configure('team-1', baseSchedule, actorId);

    await expect(repos.auditLog.findByTeamId('team-1')).resolves.toEqual([
      expect.objectContaining({
        changeType: 'schedule_change',
        previousValue: 'null',
        newValue: JSON.stringify({
          ...baseSchedule,
          timezone: 'Europe/London',
        }),
        userId: actorId,
      }),
    ]);
  });

  it('audits an update with stable complete before and after snapshots', async () => {
    await repos.teamSchedule.create({
      teamId: 'team-1',
      ...baseSchedule,
      timezone: 'Europe/London',
    });
    const changed = {
      ...baseSchedule,
      openDay: 2,
      openTime: '10:00',
      closeDay: 4,
      closeTime: '16:00',
      timezone: 'US/Eastern',
    };

    const result = await scheduleService.configure('team-1', changed, actorId);

    expect(result.schedule).toMatchObject(changed);
    await expect(repos.auditLog.findByTeamId('team-1')).resolves.toEqual([
      expect.objectContaining({
        changeType: 'schedule_change',
        previousValue: JSON.stringify({
          ...baseSchedule,
          timezone: 'Europe/London',
        }),
        newValue: JSON.stringify(changed),
        userId: actorId,
      }),
    ]);
  });

  it('does not persist or audit a normalized no-op', async () => {
    const existing = await repos.teamSchedule.create({
      teamId: 'team-1',
      ...baseSchedule,
      timezone: 'Europe/London',
    });

    const update = vi.spyOn(repos.teamSchedule, 'update');
    const result = await scheduleService.configure('team-1', baseSchedule, actorId);

    expect(result.schedule).toEqual(existing);
    expect(update).not.toHaveBeenCalled();
    await expect(repos.auditLog.findByTeamId('team-1')).resolves.toEqual([]);
  });
});


describe('ScheduleService.configure atomicity', () => {
  it('does not persist schedule state when the required audit write fails', async () => {
    const repos = createInMemoryRepositories();
    const service = createScheduleService({
      teamScheduleRepo: repos.teamSchedule,
    });
    vi.spyOn(repos.auditLog, 'create').mockRejectedValueOnce(
      new Error('audit unavailable'),
    );

    await expect(
      service.configure('team-atomic', baseSchedule, actorId),
    ).rejects.toThrow('audit unavailable');
    await expect(repos.teamSchedule.findByTeamId('team-atomic')).resolves.toBeNull();
  });
});