import type { PrismaClient, Response as PrismaResponse } from '@/generated/prisma';
import type { Response } from '../entities';
import type { ResponseRepository } from '../types';

/**
 * Prisma-backed implementation of ResponseRepository.
 * Requirements: 10.2 (response upsert with unique constraint on memberId+sessionId+questionId)
 */
export class PrismaResponseRepository implements ResponseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: {
    memberId: string;
    sessionId: string;
    questionId: string;
    score: number;
    trendIndicator?: string;
  }): Promise<Response> {
    const record = await this.prisma.response.upsert({
      where: {
        memberId_sessionId_questionId: {
          memberId: data.memberId,
          sessionId: data.sessionId,
          questionId: data.questionId,
        },
      },
      create: {
        memberId: data.memberId,
        sessionId: data.sessionId,
        questionId: data.questionId,
        score: data.score,
        trendIndicator: data.trendIndicator ?? null,
      },
      update: {
        score: data.score,
        trendIndicator: data.trendIndicator ?? null,
      },
    });
    return this.mapToEntity(record);
  }

  async findByMemberAndSession(memberId: string, sessionId: string): Promise<Response[]> {
    const records = await this.prisma.response.findMany({
      where: { memberId, sessionId },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async findBySession(sessionId: string): Promise<Response[]> {
    const records = await this.prisma.response.findMany({
      where: { sessionId },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async findRecentByTeamAndQuestion(
    teamId: string,
    questionId: string,
    count: number
  ): Promise<Response[]> {
    const records = await this.prisma.response.findMany({
      where: {
        questionId,
        session: { teamId },
      },
      orderBy: { submittedAt: 'desc' },
      take: count,
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async deleteByMemberId(memberId: string): Promise<number> {
    const result = await this.prisma.response.deleteMany({
      where: { memberId },
    });
    return result.count;
  }

  async countBySessionAndQuestion(sessionId: string, questionId: string): Promise<number> {
    return this.prisma.response.count({
      where: { sessionId, questionId },
    });
  }

  private mapToEntity(record: PrismaResponse): Response {
    return {
      id: record.id,
      memberId: record.memberId,
      sessionId: record.sessionId,
      questionId: record.questionId,
      score: record.score,
      trendIndicator: record.trendIndicator,
      submittedAt: record.submittedAt,
      updatedAt: record.updatedAt,
    };
  }
}
