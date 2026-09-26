/** Requirements: 5.12, NFR 1.2 — Slack interaction retry queue */
import type { InteractionQueueEntry, InteractionQueueRepository } from '../../slack/interaction-queue';
import { NotFoundError } from '../../errors';

export class InMemoryInteractionQueueRepository implements InteractionQueueRepository {
  private store = new Map<string, InteractionQueueEntry>();

  /**
   * Requirements: 5.12; Slack Sign In NFR 1.5
   *
   * Null when the key is already present, matching the unique index the real
   * repository relies on.
   */
  async add(data: {
    interactionPayload: string;
    responseUrl: string;
    failureReason: string;
    idempotencyKey?: string;
  }): Promise<InteractionQueueEntry | null> {
    if (
      data.idempotencyKey !== undefined &&
      [...this.store.values()].some(held => held.idempotencyKey === data.idempotencyKey)
    ) {
      return null;
    }

    const entry: InteractionQueueEntry = {
      id: crypto.randomUUID(),
      interactionPayload: data.interactionPayload,
      responseUrl: data.responseUrl,
      failureReason: data.failureReason,
      idempotencyKey: data.idempotencyKey ?? null,
      retryCount: 0,
      status: 'pending',
      createdAt: new Date(),
      nextRetryAt: new Date(),
    };
    this.store.set(entry.id, entry);
    return entry;
  }

  async findPending(now: Date): Promise<InteractionQueueEntry[]> {
    return Array.from(this.store.values()).filter(
      e => e.status === 'pending' && e.nextRetryAt !== null && e.nextRetryAt <= now
    );
  }

  async markDelivered(id: string): Promise<void> {
    const entry = this.store.get(id);
    if (!entry) throw new NotFoundError(`InteractionQueueEntry not found: ${id}`);
    entry.status = 'delivered';
  }

  async markFailed(id: string, failureReason: string): Promise<void> {
    const entry = this.store.get(id);
    if (!entry) throw new NotFoundError(`InteractionQueueEntry not found: ${id}`);
    entry.status = 'failed';
    entry.failureReason = failureReason;
  }

  async incrementRetry(id: string, nextRetryAt: Date, failureReason: string): Promise<void> {
    const entry = this.store.get(id);
    if (!entry) throw new NotFoundError(`InteractionQueueEntry not found: ${id}`);
    entry.retryCount += 1;
    entry.nextRetryAt = nextRetryAt;
    entry.failureReason = failureReason;
  }

  /** Test helper — get all entries regardless of status */
  getAll(): InteractionQueueEntry[] {
    return Array.from(this.store.values());
  }
}
