/**
 * In-memory SchedulerTickRecordRepository.
 *
 * Requirements: Remembering What Happened 2.1, 2.5, 3.2
 *
 * Append-only, newest first on read. The behaviours that belong to a database
 * — that the newest-first read and the prune go through an index rather than a
 * scan — are asserted in `src/tests/integration/scheduler-ledger.test.ts`,
 * because a fake cannot tell the difference.
 */

import type { SchedulerTickRecord } from '../entities';
import type { SchedulerTickRecordRepository } from '../types';

export class InMemorySchedulerTickRecordRepository implements SchedulerTickRecordRepository {
  private records: SchedulerTickRecord[] = [];

  async append(record: SchedulerTickRecord): Promise<void> {
    this.records.push(record);
  }

  async recent(limit: number): Promise<SchedulerTickRecord[]> {
    return [...this.records].sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime()).slice(0, limit);
  }

  async pruneBefore(cutoff: Date): Promise<number> {
    const before = this.records.length;
    this.records = this.records.filter(record => record.ranAt >= cutoff);
    return before - this.records.length;
  }
}
