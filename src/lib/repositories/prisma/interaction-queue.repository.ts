import type { PrismaClient, SlackInteractionQueue } from '@/generated/prisma';
import type {
  InteractionQueueEntry,
  InteractionQueueRepository,
} from '../../slack/interaction-queue';

/**
 * Prisma-backed implementation of the Slack interaction retry queue.
 *
 * Replaces the request-local in-memory queue used in production wiring, which
 * was discarded when the request ended and so never actually retried anything.
 *
 * Requirements: Original 5.12, 5.13; Integration 8.5
 */
export class PrismaInteractionQueueRepository implements InteractionQueueRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(data: {
    interactionPayload: string;
    responseUrl: string;
    failureReason: string;
  }): Promise<InteractionQueueEntry> {
    const record = await this.prisma.slackInteractionQueue.create({
      data: {
        interactionPayload: data.interactionPayload,
        responseUrl: data.responseUrl,
        failureReason: data.failureReason,
        retryCount: 0,
        status: 'pending',
        // Due immediately; the first drain applies backoff if it fails again
        nextRetryAt: new Date(),
      },
    });

    return this.mapToEntity(record);
  }

  async findPending(now: Date): Promise<InteractionQueueEntry[]> {
    const records = await this.prisma.slackInteractionQueue.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: now },
      },
    });

    return records.map(record => this.mapToEntity(record));
  }

  async markDelivered(id: string): Promise<void> {
    await this.prisma.slackInteractionQueue.update({
      where: { id },
      data: { status: 'delivered' },
    });
  }

  async markFailed(id: string, failureReason: string): Promise<void> {
    await this.prisma.slackInteractionQueue.update({
      where: { id },
      data: { status: 'failed', failureReason },
    });
  }

  async incrementRetry(id: string, nextRetryAt: Date, failureReason: string): Promise<void> {
    await this.prisma.slackInteractionQueue.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
        nextRetryAt,
        failureReason,
      },
    });
  }

  private mapToEntity(record: SlackInteractionQueue): InteractionQueueEntry {
    return {
      id: record.id,
      interactionPayload: record.interactionPayload,
      responseUrl: record.responseUrl,
      failureReason: record.failureReason,
      retryCount: record.retryCount,
      status: record.status as InteractionQueueEntry['status'],
      createdAt: record.createdAt,
      nextRetryAt: record.nextRetryAt,
    };
  }
}
