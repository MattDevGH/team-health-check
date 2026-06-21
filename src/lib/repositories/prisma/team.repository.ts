import type { PrismaClient, Team as PrismaTeam } from '@/generated/prisma';
import type { Team } from '../entities';
import type { TeamRepository } from '../types';
import { NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of TeamRepository.
 * Requirements: 1.1 (team creation/management), 1.5 (archive/unarchive)
 */
export class PrismaTeamRepository implements TeamRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    name: string;
    description?: string;
    privacyMode?: string;
    timezone?: string;
  }): Promise<Team> {
    const record = await this.prisma.team.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        privacyMode: data.privacyMode ?? 'anonymous',
        timezone: data.timezone ?? 'Europe/London',
      },
    });
    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<Team | null> {
    const record = await this.prisma.team.findUnique({ where: { id } });
    return record ? this.mapToEntity(record) : null;
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        Team,
        | 'name'
        | 'description'
        | 'privacyMode'
        | 'archived'
        | 'slackDeliveryStart'
        | 'slackDeliveryEnd'
        | 'timezone'
        | 'preSessionRecipient'
      >
    >
  ): Promise<Team> {
    const existing = await this.prisma.team.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Team not found: ${id}`);
    }

    const record = await this.prisma.team.update({
      where: { id },
      data,
    });
    return this.mapToEntity(record);
  }

  async list(): Promise<Team[]> {
    const records = await this.prisma.team.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: PrismaTeam): Team {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      privacyMode: record.privacyMode,
      archived: record.archived,
      slackDeliveryStart: record.slackDeliveryStart,
      slackDeliveryEnd: record.slackDeliveryEnd,
      timezone: record.timezone,
      preSessionRecipient: record.preSessionRecipient,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
