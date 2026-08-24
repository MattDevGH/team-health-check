import type { PrismaClient } from '@/generated/prisma';
import type { NotificationDeliveryRepository } from '../types';

/** Prisma unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Prisma-backed implementation of NotificationDeliveryRepository.
 *
 * The claim relies on the `@@unique([memberId, sessionId, type])` index rather
 * than a read-then-write, so two scheduler ticks racing on the same member
 * cannot both decide to send.
 *
 * Requirements 13.8, 13.10; Integration 8.2
 */
export class PrismaNotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(data: { memberId: string; sessionId: string; type: string }): Promise<boolean> {
    try {
      await this.prisma.notificationDelivery.create({
        data: {
          memberId: data.memberId,
          sessionId: data.sessionId,
          type: data.type,
        },
      });
      return true;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        // Another tick already claimed this notification
        return false;
      }
      throw error;
    }
  }

  async hasDelivered(memberId: string, sessionId: string, type: string): Promise<boolean> {
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: {
        memberId_sessionId_type: { memberId, sessionId, type },
      },
      select: { id: true },
    });

    return existing !== null;
  }
}
