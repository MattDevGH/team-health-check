import type { PrismaClient, Team as PrismaTeam } from '@/generated/prisma';
import { ConflictError, NotFoundError } from '../../errors';
import type { Team } from '../entities';
import type { CreateTeamWithCreatorData, TeamRepository } from '../types';

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

  async createWithCreator(data: CreateTeamWithCreatorData): Promise<Team> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: {
            name: data.team.name,
            description: data.team.description ?? null,
            privacyMode: 'anonymous',
            timezone: 'Europe/London',
          },
        });
        await tx.teamMember.create({
          data: {
            id: data.creator.id,
            teamId: team.id,
            name: data.creator.name,
            email: data.creator.email ?? null,
          },
        });
        await tx.teamMemberRole.create({
          data: {
            memberId: data.creator.id,
            teamId: team.id,
            role: data.creator.role,
          },
        });
        await tx.auditLogEntry.create({
          data: { teamId: team.id, ...data.audit },
        });
        return team;
      });
      return this.mapToEntity(record);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictError('Team member already belongs to a team');
      }
      throw error;
    }
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

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
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
