import type { PrismaClient, PendingGenesis as PrismaPendingGenesis } from '@/generated/prisma';
import type { PendingGenesis } from '../entities';
import type { PendingGenesisRepository } from '../types';

/**
 * Prisma-backed implementation of PendingGenesisRepository.
 * Requirement 7.2: Pending genesis for new team creation
 */
export class PrismaPendingGenesisRepository implements PendingGenesisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    token: string;
    email: string;
    expiresAt: Date;
  }): Promise<PendingGenesis> {
    const record = await this.prisma.pendingGenesis.create({
      data: {
        token: data.token,
        email: data.email,
        expiresAt: data.expiresAt,
      },
    });
    return this.mapToEntity(record);
  }

  async findByToken(token: string): Promise<PendingGenesis | null> {
    const record = await this.prisma.pendingGenesis.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  /**
   * Atomic CAS: claims a token only if it is unused and not expired.
   * Uses updateMany with WHERE conditions for atomicity —
   * if count === 0, the token was already used or expired.
   */
  async claimToken(token: string): Promise<PendingGenesis | null> {
    const result = await this.prisma.pendingGenesis.updateMany({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        used: true,
      },
    });

    if (result.count === 0) return null;

    const record = await this.prisma.pendingGenesis.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  private mapToEntity(record: PrismaPendingGenesis): PendingGenesis {
    return {
      id: record.id,
      token: record.token,
      email: record.email,
      used: record.used,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
}
