import type { PrismaClient, TeamSchedule as PrismaTeamScheduleRecord } from '@/generated/prisma';
import type { TeamSchedule } from '../entities';
import type { TeamScheduleRepository } from '../types';
import { NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of TeamScheduleRepository.
 * Requirement 3.1: Team schedule configuration
 */
export class PrismaTeamScheduleRepository implements TeamScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    teamId: string;
    cadence: string;
    openDay: number;
    openTime: string;
    closeDay: number;
    closeTime: string;
    timezone: string;
  }): Promise<TeamSchedule> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.team.update({
        where: { id: data.teamId },
        data: { timezone: data.timezone },
      });
      return transaction.teamSchedule.create({
        data: {
          teamId: data.teamId,
          cadence: data.cadence,
          openDay: data.openDay,
          openTime: data.openTime,
          closeDay: data.closeDay,
          closeTime: data.closeTime,
        },
      });
    });
    return this.mapToEntity(record, data.timezone);
  }

  async findByTeamId(teamId: string): Promise<TeamSchedule | null> {
    const record = await this.prisma.teamSchedule.findUnique({ where: { teamId } });
    if (!record) return null;

    // Timezone is stored on Team, not TeamSchedule in the DB schema.
    // Fetch team timezone as fallback.
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { timezone: true },
    });
    return this.mapToEntity(record, team?.timezone ?? 'Europe/London');
  }

  async update(
    teamId: string,
    data: Partial<Pick<TeamSchedule, 'cadence' | 'openDay' | 'openTime' | 'closeDay' | 'closeTime' | 'timezone'>>
  ): Promise<TeamSchedule> {
    const existing = await this.prisma.teamSchedule.findUnique({ where: { teamId } });
    if (!existing) {
      throw new NotFoundError(`Schedule not found for team: ${teamId}`);
    }

    const { timezone, ...dbFields } = data;
    const record = await this.prisma.$transaction(async (transaction) => {
      if (timezone !== undefined) {
        await transaction.team.update({
          where: { id: teamId },
          data: { timezone },
        });
      }
      return transaction.teamSchedule.update({
        where: { teamId },
        data: dbFields,
      });
    });

    if (timezone !== undefined) {
      return this.mapToEntity(record, timezone);
    }
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { timezone: true },
    });
    return this.mapToEntity(record, team?.timezone ?? 'Europe/London');
  }

  async saveWithAudit(
    data: {
      teamId: string;
      cadence: string;
      openDay: number;
      openTime: string;
      closeDay: number;
      closeTime: string;
      timezone: string;
    },
    audit: {
      changeType: string;
      previousValue: string;
      newValue: string;
      userId: string;
    },
  ): Promise<TeamSchedule> {
    const scheduleData = {
      cadence: data.cadence,
      openDay: data.openDay,
      openTime: data.openTime,
      closeDay: data.closeDay,
      closeTime: data.closeTime,
    };
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.team.update({
        where: { id: data.teamId },
        data: { timezone: data.timezone },
      });
      const schedule = await transaction.teamSchedule.upsert({
        where: { teamId: data.teamId },
        create: { teamId: data.teamId, ...scheduleData },
        update: scheduleData,
      });
      await transaction.auditLogEntry.create({
        data: { teamId: data.teamId, ...audit },
      });
      return schedule;
    });
    return this.mapToEntity(record, data.timezone);
  }

  private mapToEntity(record: PrismaTeamScheduleRecord, timezone: string): TeamSchedule {
    return {
      id: record.id,
      teamId: record.teamId,
      cadence: record.cadence,
      openDay: record.openDay,
      openTime: record.openTime,
      closeDay: record.closeDay,
      closeTime: record.closeTime,
      timezone,
      createdAt: record.createdAt,
    };
  }
}
