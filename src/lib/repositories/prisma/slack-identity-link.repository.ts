import type { PrismaClient, SlackIdentityLink as PrismaSlackIdentityLink } from '@/generated/prisma';
import type { SlackIdentityLink } from '../entities';
import type { SlackIdentityLinkRepository } from '../types';

/**
 * Prisma-backed implementation of SlackIdentityLinkRepository.
 * Requirements 7.1, 7.2, 7.3: Slack identity link persistence
 */
export class PrismaSlackIdentityLinkRepository implements SlackIdentityLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { memberId: string; slackUserId: string }): Promise<SlackIdentityLink> {
    const record = await this.prisma.slackIdentityLink.create({
      data: {
        memberId: data.memberId,
        slackUserId: data.slackUserId,
      },
    });
    return this.mapToEntity(record);
  }

  async findByMemberId(memberId: string): Promise<SlackIdentityLink | null> {
    const record = await this.prisma.slackIdentityLink.findUnique({
      where: { memberId },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async findBySlackUserId(slackUserId: string): Promise<SlackIdentityLink | null> {
    const record = await this.prisma.slackIdentityLink.findUnique({
      where: { slackUserId },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async upsertByMemberId(memberId: string, slackUserId: string): Promise<SlackIdentityLink> {
    const record = await this.prisma.slackIdentityLink.upsert({
      where: { memberId },
      create: { memberId, slackUserId },
      update: { slackUserId },
    });
    return this.mapToEntity(record);
  }

  async delete(memberId: string): Promise<void> {
    await this.prisma.slackIdentityLink.deleteMany({
      where: { memberId },
    });
  }

  private mapToEntity(record: PrismaSlackIdentityLink): SlackIdentityLink {
    return {
      id: record.id,
      memberId: record.memberId,
      slackUserId: record.slackUserId,
      createdAt: record.linkedAt,
    };
  }
}
