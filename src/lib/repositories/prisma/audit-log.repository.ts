import type { PrismaClient, AuditLogEntry as PrismaAuditLogEntry } from '@/generated/prisma';
import type { AuditLogEntry } from '../entities';
import type { AuditLogRepository } from '../types';

const DEFAULT_LIMIT = 50;

/**
 * Prisma-backed implementation of AuditLogRepository.
 * Requirements: 18.1 (audit log)
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entry: {
    teamId: string;
    changeType: string;
    previousValue: string;
    newValue: string;
    userId: string;
  }): Promise<AuditLogEntry> {
    const record = await this.prisma.auditLogEntry.create({
      data: {
        teamId: entry.teamId,
        changeType: entry.changeType,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        userId: entry.userId,
      },
    });
    return this.mapToEntity(record);
  }

  async findByTeamId(
    teamId: string,
    pagination?: { cursor?: string; limit?: number }
  ): Promise<AuditLogEntry[]> {
    const limit = pagination?.limit ?? DEFAULT_LIMIT;
    const cursor = pagination?.cursor;

    const records = await this.prisma.auditLogEntry.findMany({
      where: { teamId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: PrismaAuditLogEntry): AuditLogEntry {
    return {
      id: record.id,
      teamId: record.teamId,
      changeType: record.changeType,
      previousValue: record.previousValue,
      newValue: record.newValue,
      userId: record.userId,
      timestamp: record.timestamp,
    };
  }
}
