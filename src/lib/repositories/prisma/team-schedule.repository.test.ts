import type { PrismaClient, TeamSchedule } from '@/generated/prisma';
import { describe, expect, it, vi } from 'vitest';

import { PrismaTeamScheduleRepository } from './team-schedule.repository';

const record: TeamSchedule = {
  id: 'schedule-1',
  teamId: 'team-1',
  cadence: 'weekly',
  openDay: 1,
  openTime: '09:00',
  closeDay: 5,
  closeTime: '17:00',
  createdAt: new Date('2026-08-22T12:00:00.000Z'),
};

describe('PrismaTeamScheduleRepository timezone persistence', () => {
  it('persists the canonical team timezone when creating a schedule', async () => {
    const transactionClient = {
      team: { update: vi.fn().mockResolvedValue({}) },
      teamSchedule: { create: vi.fn().mockResolvedValue(record) },
    };
    const transaction = vi.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) => (
        operation(transactionClient)
      ),
    );
    const repository = new PrismaTeamScheduleRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);

    await expect(repository.create({
      teamId: 'team-1',
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'America/New_York',
    })).resolves.toMatchObject({ timezone: 'America/New_York' });

    expect(transactionClient.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { timezone: 'America/New_York' },
    });
  });

  it('updates the canonical team timezone in the schedule transaction', async () => {
    const transactionClient = {
      team: { update: vi.fn().mockResolvedValue({}) },
      teamSchedule: { update: vi.fn().mockResolvedValue(record) },
    };
    const transaction = vi.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) => (
        operation(transactionClient)
      ),
    );
    const prisma = {
      teamSchedule: { findUnique: vi.fn().mockResolvedValue(record) },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repository = new PrismaTeamScheduleRepository(prisma);

    await expect(repository.update('team-1', {
      openDay: 2,
      timezone: 'UTC',
    })).resolves.toMatchObject({ timezone: 'UTC' });

    expect(transactionClient.team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { timezone: 'UTC' },
    });
    expect(transactionClient.teamSchedule.update).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      data: { openDay: 2 },
    });
  });
});


describe('PrismaTeamScheduleRepository.saveWithAudit', () => {
  it('writes timezone, schedule, and audit in one transaction', async () => {
    const transactionClient = {
      team: { update: vi.fn().mockResolvedValue({}) },
      teamSchedule: { upsert: vi.fn().mockResolvedValue(record) },
      auditLogEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    const transaction = vi.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) => (
        operation(transactionClient)
      ),
    );
    const repository = new PrismaTeamScheduleRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);
    const schedule = {
      teamId: 'team-1',
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    };
    const audit = {
      changeType: 'schedule_change',
      previousValue: 'null',
      newValue: JSON.stringify(schedule),
      userId: 'manager-1',
    };

    await repository.saveWithAudit(schedule, audit);

    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionClient.auditLogEntry.create).toHaveBeenCalledWith({
      data: { teamId: schedule.teamId, ...audit },
    });
  });
});