import type { PrismaClient, PairingCode as PrismaPairingCode } from '@/generated/prisma';
import type { PairingCode } from '../entities';
import type { PairingCodeRepository } from '../types';
import { NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of PairingCodeRepository.
 * Requirement 2.4: Slack pairing codes
 */
export class PrismaPairingCodeRepository implements PairingCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    code: string;
    slackUserId: string;
    expiresAt: Date;
  }): Promise<PairingCode> {
    const record = await this.prisma.pairingCode.create({
      data: {
        code: data.code,
        slackUserId: data.slackUserId,
        expiresAt: data.expiresAt,
      },
    });
    return this.mapToEntity(record);
  }

  async findByCode(code: string): Promise<PairingCode | null> {
    const record = await this.prisma.pairingCode.findUnique({ where: { code } });
    return record ? this.mapToEntity(record) : null;
  }

  async markUsed(id: string): Promise<void> {
    const existing = await this.prisma.pairingCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`PairingCode not found: ${id}`);
    }

    await this.prisma.pairingCode.update({
      where: { id },
      data: { used: true },
    });
  }

  private mapToEntity(record: PrismaPairingCode): PairingCode {
    return {
      id: record.id,
      code: record.code,
      slackUserId: record.slackUserId,
      used: record.used,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
}
