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
  retryCount: number;
  status: 'pending' | 'delivered' | 'failed';
  createdAt: Date;
  nextRetryAt: Date | null;
}

export interface InteractionQueueRepository {
  add(entry: {
    interactionPayload: string;
    responseUrl: string;
    failureReason: string;
  }): Promise<InteractionQueueEntry>;
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
     * Enqueue a failed interaction for later retry.
     */
    async enqueue(params: {
      interactionPayload: string;
      responseUrl: string;
      failureReason: string;
    }): Promise<InteractionQueueEntry> {
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
