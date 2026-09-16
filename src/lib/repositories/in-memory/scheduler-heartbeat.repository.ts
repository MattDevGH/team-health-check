/**
 * In-memory SchedulerHeartbeatRepository.
 *
 * Requirements: Remembering What Happened 1.1, 1.2
 *
 * Mirrors the Prisma implementation's replace-rather-append behaviour, which it
 * gets for free by holding one value. That freeness is the reason the real
 * guarantee is asserted against a database instead: a fake cannot tell an
 * upsert from an insert, so the test that matters lives in
 * `src/tests/integration/scheduler-heartbeat.test.ts`.
 */

import type { SchedulerHeartbeat } from '../entities';
import type { SchedulerHeartbeatRepository } from '../types';

export class InMemorySchedulerHeartbeatRepository implements SchedulerHeartbeatRepository {
  private beat: SchedulerHeartbeat | null = null;

  async record(beat: SchedulerHeartbeat): Promise<void> {
    this.beat = beat;
  }

  async latest(): Promise<SchedulerHeartbeat | null> {
    return this.beat;
  }
}
