import type { PrismaClient, SessionLink as PrismaSessionLink } from '@/generated/prisma';
import type { SessionLink } from '../entities';
import type { SessionLinkRepository } from '../types';

/**
 * Prisma-backed implementation of SessionLinkRepository.
 * Requirement 6.1: Session link generation
 */
export class PrismaSessionLinkRepository implements SessionLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    token: string;
    memberId: string;
    sessionId: string;
    expiresAt: Date;
  }): Promise<SessionLink> {
    const record = await this.prisma.sessionLink.create({
      data: {
        token: data.token,
        memberId: data.memberId,
        sessionId: data.sessionId,
        expiresAt: data.expiresAt,
      },
    });
    return this.mapToEntity(record);
  }

  async findByToken(token: string): Promise<SessionLink | null> {
    const record = await this.prisma.sessionLink.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  async findByMemberAndSession(memberId: string, sessionId: string): Promise<SessionLink | null> {
    const record = await this.prisma.sessionLink.findFirst({
      where: { memberId, sessionId },
    });
    return record ? this.mapToEntity(record) : null;
  }

  private mapToEntity(record: PrismaSessionLink): SessionLink {
    return {
      id: record.id,
      token: record.token,
      memberId: record.memberId,
      sessionId: record.sessionId,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
}
