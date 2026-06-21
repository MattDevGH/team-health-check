/**
 * Tests for the Slack interaction retry queue.
 * Requirements: 5.12, NFR 1.2
 */
import { describe, it, expect, vi } from 'vitest';
import { createInteractionQueue } from './interaction-queue';
import { InMemoryInteractionQueueRepository } from '../repositories/in-memory/interaction-queue.repository';

function createTestQueue() {
  const repo = new InMemoryInteractionQueueRepository();
  const queue = createInteractionQueue({ repo });
  return { repo, queue };
}

describe('interaction-queue', () => {
  describe('enqueue', () => {
    it('adds entry with pending status and failure reason', async () => {
      const { repo, queue } = createTestQueue();

      await queue.enqueue({
        interactionPayload: '{"text":"confirmation"}',
        responseUrl: 'https://hooks.slack.com/actions/T123/456/respond',
        failureReason: 'HTTP 503',
      });

      const entries = repo.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('pending');
      expect(entries[0].failureReason).toBe('HTTP 503');
      expect(entries[0].interactionPayload).toBe('{"text":"confirmation"}');
      expect(entries[0].responseUrl).toBe('https://hooks.slack.com/actions/T123/456/respond');
      expect(entries[0].retryCount).toBe(0);
    });
  });

  describe('processPending', () => {
    it('calls deliverFn for each pending entry', async () => {
      const { repo, queue } = createTestQueue();

      await queue.enqueue({
        interactionPayload: '{"text":"msg1"}',
        responseUrl: 'https://hooks.slack.com/1',
        failureReason: 'timeout',
      });
      await queue.enqueue({
        interactionPayload: '{"text":"msg2"}',
        responseUrl: 'https://hooks.slack.com/2',
        failureReason: 'HTTP 500',
      });

      // Use a time well after the entries were created
      const now = new Date(Date.now() + 60_000);
      const deliverFn = vi.fn().mockResolvedValue(true);
      await queue.processPending(deliverFn, now);

      expect(deliverFn).toHaveBeenCalledTimes(2);
      expect(deliverFn).toHaveBeenCalledWith('https://hooks.slack.com/1', '{"text":"msg1"}');
      expect(deliverFn).toHaveBeenCalledWith('https://hooks.slack.com/2', '{"text":"msg2"}');
    });

    it('marks entry as delivered on successful delivery', async () => {
      const { repo, queue } = createTestQueue();

      await queue.enqueue({
        interactionPayload: '{"text":"confirmation"}',
        responseUrl: 'https://hooks.slack.com/1',
        failureReason: 'timeout',
      });

      const now = new Date(Date.now() + 60_000);
      const deliverFn = vi.fn().mockResolvedValue(true);
      await queue.processPending(deliverFn, now);

      const entries = repo.getAll();
      expect(entries[0].status).toBe('delivered');
    });

    it('increments retry count with backoff on failed delivery', async () => {
      const { repo, queue } = createTestQueue();
      const now = new Date(Date.now() + 60_000);

      await queue.enqueue({
        interactionPayload: '{"text":"msg"}',
        responseUrl: 'https://hooks.slack.com/1',
        failureReason: 'timeout',
      });

      const deliverFn = vi.fn().mockResolvedValue(false);
      await queue.processPending(deliverFn, now);

      const entries = repo.getAll();
      expect(entries[0].status).toBe('pending');
      expect(entries[0].retryCount).toBe(1);
      expect(entries[0].failureReason).toBe('Delivery failed');
      // First backoff is 30 seconds from `now`
      const expectedRetryAt = new Date(now.getTime() + 30_000);
      expect(entries[0].nextRetryAt).toEqual(expectedRetryAt);
    });

    it('marks entry as failed when retryCount reaches MAX_QUEUE_RETRIES (5)', async () => {
      const { repo, queue } = createTestQueue();

      // Enqueue and manually set retryCount to 5 (exhausted)
      const entry = await queue.enqueue({
        interactionPayload: '{"text":"msg"}',
        responseUrl: 'https://hooks.slack.com/1',
        failureReason: 'persistent failure',
      });

      // Simulate 5 previous retries by incrementing (nextRetryAt in past so it's picked up)
      const pastDate = new Date(Date.now() - 60_000);
      for (let i = 0; i < 5; i++) {
        await repo.incrementRetry(entry.id, pastDate, 'failed');
      }

      const now = new Date(Date.now() + 60_000);
      const deliverFn = vi.fn().mockResolvedValue(false);
      await queue.processPending(deliverFn, now);

      const entries = repo.getAll();
      expect(entries[0].status).toBe('failed');
      expect(entries[0].failureReason).toBe('Max retries exhausted');
      // deliverFn should NOT have been called — entry was already exhausted
      expect(deliverFn).not.toHaveBeenCalled();
    });

    it('does not process entries whose nextRetryAt is in the future', async () => {
      const { repo, queue } = createTestQueue();

      const entry = await queue.enqueue({
        interactionPayload: '{"text":"msg"}',
        responseUrl: 'https://hooks.slack.com/1',
        failureReason: 'timeout',
      });

      // Set nextRetryAt far into the future
      const futureDate = new Date(Date.now() + 3_600_000);
      await repo.incrementRetry(entry.id, futureDate, 'timeout');

      const now = new Date();
      const deliverFn = vi.fn().mockResolvedValue(true);
      await queue.processPending(deliverFn, now);

      expect(deliverFn).not.toHaveBeenCalled();
    });
  });
});
