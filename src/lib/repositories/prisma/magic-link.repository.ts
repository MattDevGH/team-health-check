import type { PrismaClient, MagicLink as PrismaMagicLink } from '@/generated/prisma';
import type { MagicLink } from '../entities';
import type { MagicLinkRepository } from '../types';

/**
 * Prisma-backed implementation of MagicLinkRepository.
 * Requirement 7.2: Magic link single-use access
 */
export class PrismaMagicLinkRepository implements MagicLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    token: string;
    memberId: string;
    expiresAt: Date;
  }): Promise<MagicLink> {
    const record = await this.prisma.magicLink.create({
      data: {
        token: data.token,
        memberId: data.memberId,
        expiresAt: data.expiresAt,
      },
    });
    return this.mapToEntity(record);
  }

  async findByToken(token: string): Promise<MagicLink | null> {
    const record = await this.prisma.magicLink.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  /**
   * Atomic CAS: claims a token only if it is unused and not expired.
   * Uses updateMany with WHERE conditions for atomicity —
   * if count === 0, the token was already used or expired.
   */
  async claimToken(token: string): Promise<MagicLink | null> {
    const result = await this.prisma.magicLink.updateMany({
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

    const record = await this.prisma.magicLink.findUnique({ where: { token } });
    return record ? this.mapToEntity(record) : null;
  }

  private mapToEntity(record: PrismaMagicLink): MagicLink {
    return {
      id: record.id,
      token: record.token,
      memberId: record.memberId,
      used: record.used,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
}
