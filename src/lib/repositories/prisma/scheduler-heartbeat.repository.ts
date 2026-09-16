/**
 * Prisma-backed SchedulerHeartbeatRepository.
 *
 * Requirements: Remembering What Happened 1.1, 1.2, 1.5
 *
 * One row, replaced by every tick. The fixed id is what gives the upsert
 * something to collide on — without a constant key there is nothing to replace
 * and every tick would append, which is the failure an integration test over a
 * real database exists to catch.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { SchedulerHeartbeat } from '../entities';
import type { SchedulerHeartbeatRepository } from '../types';

/**
 * The one row's primary key.
 *
 * A constant rather than something generated: two ticks running at once must
 * aim at the same row, or the race leaves two rows and the table grows for
 * ever at three hundred a day.
 */
const SINGLETON_ID = 'scheduler';

export class PrismaSchedulerHeartbeatRepository implements SchedulerHeartbeatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(beat: SchedulerHeartbeat): Promise<void> {
    /*
     * An upsert rather than a read-then-write. Two ticks at once then leave one
     * row and both wrote the truth, which is the only guarantee worth having:
     * which of them won is not interesting, since a heartbeat says the
     * scheduler ran and both of them did.
     */
    await this.prisma.schedulerHeartbeat.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...beat },
      update: beat,
    });
  }

  async latest(): Promise<SchedulerHeartbeat | null> {
    const row = await this.prisma.schedulerHeartbeat.findUnique({
      where: { id: SINGLETON_ID },
    });

    if (!row) return null;

    // Mapped field by field rather than spread, so a column added to the table
    // cannot reach a caller without somebody deciding it should
    return {
      tickId: row.tickId,
      ranAt: row.ranAt,
      summary: row.summary,
      opened: row.opened,
      closed: row.closed,
      materialised: row.materialised,
      prompts: row.prompts,
      durationMs: row.durationMs,
    };
  }
}
