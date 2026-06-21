import type { PrismaClient, SessionAggregate as PrismaSessionAggregate } from '@/generated/prisma';
import type { SessionAggregate } from '../entities';
import type { SessionAggregateRepository } from '../types';

/**
 * Prisma-backed implementation of SessionAggregateRepository.
 * Requirements: 8.1 (session aggregates for trend visualisation)
 */
export class PrismaSessionAggregateRepository implements SessionAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    sessionId: string;
    questionId: string;
    averageScore: number;
    responseCount: number;
    improvingCount: number;
    stableCount: number;
    decliningCount: number;
  }): Promise<SessionAggregate> {
    const record = await this.prisma.sessionAggregate.create({
      data: {
        sessionId: data.sessionId,
        questionId: data.questionId,
        averageScore: data.averageScore,
        responseCount: data.responseCount,
        improvingCount: data.improvingCount,
        stableCount: data.stableCount,
        decliningCount: data.decliningCount,
      },
    });
    return this.mapToEntity(record);
  }

  async findBySessionId(sessionId: string): Promise<SessionAggregate[]> {
    const records = await this.prisma.sessionAggregate.findMany({
      where: { sessionId },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async findByTeamId(teamId: string): Promise<SessionAggregate[]> {
    const records = await this.prisma.sessionAggregate.findMany({
      where: { session: { teamId } },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: PrismaSessionAggregate): SessionAggregate {
    return {
      id: record.id,
      sessionId: record.sessionId,
      questionId: record.questionId,
      averageScore: record.averageScore,
      responseCount: record.responseCount,
      improvingCount: record.improvingCount,
      stableCount: record.stableCount,
      decliningCount: record.decliningCount,
      materialisedAt: record.materialisedAt,
    };
  }
}
