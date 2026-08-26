import type { PrismaClient, HealthCheckSession as PrismaHealthCheckSession } from '@/generated/prisma';
import type { HealthCheckSession } from '../entities';
import type { SessionRepository } from '../types';
import { NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of SessionRepository.
 * Requirements: 3.2 (session lifecycle)
 */
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    teamId: string;
    status: string;
    scheduledOpenAt?: Date;
    scheduledCloseAt?: Date;
  }): Promise<HealthCheckSession> {
    const record = await this.prisma.healthCheckSession.create({
      data: {
        teamId: data.teamId,
        status: data.status,
        scheduledOpenAt: data.scheduledOpenAt ?? null,
        scheduledCloseAt: data.scheduledCloseAt ?? null,
      },
    });
    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<HealthCheckSession | null> {
    const record = await this.prisma.healthCheckSession.findUnique({ where: { id } });
    return record ? this.mapToEntity(record) : null;
  }

  async findOpenByTeamId(teamId: string): Promise<HealthCheckSession | null> {
    const record = await this.prisma.healthCheckSession.findFirst({
      where: { teamId, status: 'open' },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async findByTeamId(teamId: string): Promise<HealthCheckSession[]> {
    const records = await this.prisma.healthCheckSession.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async update(
    id: string,
    data: Partial<Pick<HealthCheckSession, 'status' | 'actualCloseAt'>>
  ): Promise<HealthCheckSession> {
    const existing = await this.prisma.healthCheckSession.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Session not found: ${id}`);
    }

    const record = await this.prisma.healthCheckSession.update({
      where: { id },
      data,
    });
    return this.mapToEntity(record);
  }

  private mapToEntity(record: PrismaHealthCheckSession): HealthCheckSession {
    return {
      id: record.id,
      teamId: record.teamId,
      status: record.status,
      scheduledOpenAt: record.scheduledOpenAt,
      scheduledCloseAt: record.scheduledCloseAt,
      actualOpenAt: record.actualOpenAt,
      actualCloseAt: record.actualCloseAt,
      createdAt: record.createdAt,
    };
  }
}
