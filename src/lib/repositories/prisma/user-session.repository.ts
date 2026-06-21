import type { PrismaClient, UserSession as PrismaUserSession } from '@/generated/prisma';
import type { UserSession } from '../entities';
import type { UserSessionRepository } from '../types';

/**
 * Prisma-backed implementation of UserSessionRepository.
 * Requirement 7.2: Authenticated user sessions
 */
export class PrismaUserSessionRepository implements UserSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    memberId: string;
    token: string;
    expiresAt: Date;
  }): Promise<UserSession> {
    const record = await this.prisma.userSession.create({
      data: {
        memberId: data.memberId,
        token: data.token,
        expiresAt: data.expiresAt,
      },
    });
    return this.mapToEntity(record);
  }

  async findByToken(token: string): Promise<UserSession | null> {
    const record = await this.prisma.userSession.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  private mapToEntity(record: PrismaUserSession): UserSession {
    return {
      id: record.id,
      memberId: record.memberId,
      token: record.token,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
}
