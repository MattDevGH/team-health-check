/**
 * Prisma-backed SchedulerTickRecordRepository.
 *
 * Requirements: Remembering What Happened 2.1, 2.4, 2.5, 3.2, 3.3
 *
 * Appended, unlike the heartbeat, and only for ticks that did something. The
 * index on `ranAt` serves both reads that matter: newest-first, and the ranged
 * delete that prunes.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { SchedulerTickRecord } from '../entities';
import type { SchedulerTickRecordRepository } from '../types';

/**
 * Skip reasons, out of and back into a column that has no map type.
 *
 * Reading tolerates anything: a text column can hold text that is not JSON,
 * and a reader that threw would take a whole page down over one malformed row
 * written by a version of this code that no longer exists.
 */
function encodeReasons(reasons: Record<string, number>): string {
  return JSON.stringify(reasons);
}

function decodeReasons(stored: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const reasons: Record<string, number> = {};
    for (const [reason, count] of Object.entries(parsed)) {
      if (typeof count === 'number') reasons[reason] = count;
    }
    return reasons;
  } catch {
    return {};
  }
}

export class PrismaSchedulerTickRecordRepository implements SchedulerTickRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(record: SchedulerTickRecord): Promise<void> {
    await this.prisma.schedulerTickRecord.create({
      data: { ...record, reasons: encodeReasons(record.reasons) },
    });
  }

  async recent(limit: number): Promise<SchedulerTickRecord[]> {
    const rows = await this.prisma.schedulerTickRecord.findMany({
      orderBy: { ranAt: 'desc' },
      take: limit,
    });

    return rows.map(row => ({
      tickId: row.tickId,
      ranAt: row.ranAt,
      summary: row.summary,
      opened: row.opened,
      closed: row.closed,
      materialised: row.materialised,
      prompts: row.prompts,
      failures: row.failures,
      durationMs: row.durationMs,
      reasons: decodeReasons(row.reasons),
    }));
  }

  async pruneBefore(cutoff: Date): Promise<number> {
    /*
     * A ranged delete against the index, not a scan. On a weekly cadence this
     * deletes nothing on almost every tick and costs one indexed lookup, which
     * is what makes it affordable to run every time rather than schedule.
     */
    const { count } = await this.prisma.schedulerTickRecord.deleteMany({
      where: { ranAt: { lt: cutoff } },
    });

    return count;
  }
}
