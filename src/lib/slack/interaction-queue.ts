/**
 * Slack interaction retry queue.
 * Captures failed response_url deliveries and retries them on subsequent scheduler ticks.
 * Requirements: 5.12, NFR 1.2
 */

export interface InteractionQueueEntry {
  id: string;
  interactionPayload: string;
  responseUrl: string;
  failureReason: string | null;
  /** Stable per interaction and the same across Slack retries; null when none. */
  idempotencyKey?: string | null;
  retryCount: number;
  status: 'pending' | 'delivered' | 'failed';
  createdAt: Date;
  nextRetryAt: Date | null;
}

export interface InteractionQueueRepository {
  /**
   * Requirements: 5.12; Slack Sign In NFR 1.5
   *
   * Returns null when `idempotencyKey` names work already queued or done.
   * Slack retries an interaction it believes failed, replaying the same
   * payload — the score upsert survives that on its own key, but enqueuing
   * twice would apply it twice and reply twice.
   *
   * Decided by the unique index rather than a prior read, because two retries
   * can arrive at once and a check-then-insert would let both through.
   */
  add(entry: {
    interactionPayload: string;
    responseUrl: string;
    failureReason: string;
    idempotencyKey?: string;
  }): Promise<InteractionQueueEntry | null>;
  findPending(now: Date): Promise<InteractionQueueEntry[]>;
  markDelivered(id: string): Promise<void>;
  markFailed(id: string, failureReason: string): Promise<void>;
  incrementRetry(id: string, nextRetryAt: Date, failureReason: string): Promise<void>;
}

const MAX_QUEUE_RETRIES = 5;

/** Exponential backoff schedule in milliseconds: 30s, 2min, 8min, 20min */
function calculateBackoff(retryCount: number): number {
  const schedule = [30_000, 120_000, 480_000, 1_200_000];
  return schedule[Math.min(retryCount, schedule.length - 1)];
}

export function createInteractionQueue(deps: { repo: InteractionQueueRepository }) {
  return {
    /**
     * Enqueue work for later retry.
     *
     * Requirements: 5.12; Slack Sign In NFR 1.5
     *
     * Null when `idempotencyKey` names an interaction already queued or done —
     * Slack replays the same payload when it believes a delivery failed, and
     * accepting it twice would apply the scores twice and reply twice.
     */
    async enqueue(params: {
      interactionPayload: string;
      responseUrl: string;
      idempotencyKey?: string;
      failureReason: string;
    }): Promise<InteractionQueueEntry | null> {
      return deps.repo.add(params);
    },

    /**
     * Process all pending queue entries whose nextRetryAt has passed.
     * Called from the scheduler tick.
     */
    async processPending(
      deliverFn: (responseUrl: string, payload: string) => Promise<boolean>,
      now: Date = new Date()
    ): Promise<void> {
      const pending = await deps.repo.findPending(now);

      for (const entry of pending) {
        if (entry.retryCount >= MAX_QUEUE_RETRIES) {
          await deps.repo.markFailed(entry.id, 'Max retries exhausted');
          continue;
        }

        const success = await deliverFn(entry.responseUrl, entry.interactionPayload);

        if (success) {
          await deps.repo.markDelivered(entry.id);
        } else {
          const backoff = calculateBackoff(entry.retryCount);
          const nextRetryAt = new Date(now.getTime() + backoff);
          await deps.repo.incrementRetry(entry.id, nextRetryAt, 'Delivery failed');
        }
      }
    },
  };
}
