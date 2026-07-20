/**
 * Prisma-backed implementation of AvailabilityRepository.
 * Requirement 12.1: Team member availability
 */

import type { PrismaClient } from '@/generated/prisma';
import type { Availability } from '../entities';
import type { AvailabilityRepository } from '../types';
import { NotFoundError } from '../../errors';

export class PrismaAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { memberId: string; awayFrom: Date; awayUntil: Date }): Promise<Availability> {
    const record = await this.prisma.availability.create({
      data: {
        memberId: data.memberId,
        awayFrom: data.awayFrom,
        awayUntil: data.awayUntil,
      },
    });
    return this.mapToEntity(record);
  }

  async findByMemberId(memberId: string): Promise<Availability[]> {
    const records = await this.prisma.availability.findMany({
      where: { memberId },
    });
    return records.map(r => this.mapToEntity(r));
  }

  async findActiveByMemberIdAndDate(memberId: string, date: Date): Promise<Availability | null> {
    const record = await this.prisma.availability.findFirst({
      where: {
        memberId,
        awayFrom: { lte: date },
        awayUntil: { gte: date },
      },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.availability.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Availability not found: ${id}`);
    }
    await this.prisma.availability.delete({ where: { id } });
  }

  private mapToEntity(record: { id: string; memberId: string; awayFrom: Date; awayUntil: Date; createdAt: Date }): Availability {
    return {
      id: record.id,
      memberId: record.memberId,
      awayFrom: record.awayFrom,
      awayUntil: record.awayUntil,
      createdAt: record.createdAt,
    };
  }
}
