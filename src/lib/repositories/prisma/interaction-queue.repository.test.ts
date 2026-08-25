/**
 * Tests for the Prisma-backed Slack interaction retry queue.
 *
 * The queue is the only thing standing between a failed Slack delivery and
 * silent loss, so its persistence semantics are pinned against a stubbed client
 * rather than exercised only through the in-memory fake.
 *
 * Requirements: Original 5.13; Integration 8.5
 */

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma';

import { PrismaInteractionQueueRepository } from './interaction-queue.repository';

interface QueueRow {
  id: string;
  interactionPayload: string;
  responseUrl: string;
  failureReason: string | null;
  retryCount: number;
  status: string;
  createdAt: Date;
  nextRetryAt: Date | null;
}

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'queue-1',
    interactionPayload: '{"kind":"dm"}',
    responseUrl: '',
    failureReason: 'channel_not_found',
    retryCount: 0,
    status: 'pending',
    createdAt: new Date('2026-08-25T09:00:00.000Z'),
    nextRetryAt: new Date('2026-08-25T09:00:00.000Z'),
    ...overrides,
  };
}

/** Minimal in-memory stand-in for prisma.slackInteractionQueue. */
function stubPrisma(initial: QueueRow[] = []) {
  const rows = [...initial];

  const create = vi.fn(async ({ data }: { data: Partial<QueueRow> }) => {
    const created = row({ id: `queue-${rows.length + 1}`, ...data });
    rows.push(created);
    return created;
  });

  const findMany = vi.fn(async ({ where }: {
    where: { status: string; nextRetryAt: { lte: Date } };
  }) => rows.filter(
    r => r.status === where.status && r.nextRetryAt !== null && r.nextRetryAt <= where.nextRetryAt.lte,
  ));

  const update = vi.fn(async ({ where, data }: {
    where: { id: string };
    data: Omit<Partial<QueueRow>, 'retryCount'> & {
      retryCount?: { increment: number } | number;
    };
  }) => {
    const index = rows.findIndex(r => r.id === where.id);
    if (index === -1) throw new Error('not found');

    const { retryCount, ...rest } = data;
    const next: QueueRow = { ...rows[index], ...(rest as Partial<QueueRow>) };
    if (typeof retryCount === 'number') {
      next.retryCount = retryCount;
    } else if (retryCount && typeof retryCount === 'object') {
      next.retryCount = rows[index].retryCount + retryCount.increment;
    }
    rows[index] = next;
    return next;
  });

  const prisma = {
    slackInteractionQueue: { create, findMany, update },
  } as unknown as PrismaClient;

  return { prisma, rows, create, findMany, update };
}

describe('PrismaInteractionQueueRepository', () => {
  it('adds an entry as pending and immediately due', async () => {
    const { prisma, create } = stubPrisma();
    const repository = new PrismaInteractionQueueRepository(prisma);

    const entry = await repository.add({
      interactionPayload: '{"kind":"dm","memberId":"m1"}',
      responseUrl: '',
      failureReason: 'channel_not_found',
    });

    expect(entry.status).toBe('pending');
    expect(entry.retryCount).toBe(0);
    expect(entry.nextRetryAt).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns only pending entries that are due', async () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const { prisma } = stubPrisma([
      row({ id: 'due', nextRetryAt: new Date('2026-08-25T11:00:00.000Z') }),
      row({ id: 'not-due', nextRetryAt: new Date('2026-08-25T13:00:00.000Z') }),
      row({ id: 'delivered', status: 'delivered', nextRetryAt: new Date('2026-08-25T11:00:00.000Z') }),
    ]);
    const repository = new PrismaInteractionQueueRepository(prisma);

    const pending = await repository.findPending(now);

    expect(pending.map(entry => entry.id)).toEqual(['due']);
  });

  it('marks an entry delivered', async () => {
    const { prisma, rows } = stubPrisma([row()]);
    const repository = new PrismaInteractionQueueRepository(prisma);

    await repository.markDelivered('queue-1');

    expect(rows[0].status).toBe('delivered');
  });

  it('marks an entry permanently failed with a reason', async () => {
    const { prisma, rows } = stubPrisma([row()]);
    const repository = new PrismaInteractionQueueRepository(prisma);

    await repository.markFailed('queue-1', 'Max retries exhausted');

    expect(rows[0].status).toBe('failed');
    expect(rows[0].failureReason).toBe('Max retries exhausted');
  });

  it('increments the retry count and schedules the next attempt', async () => {
    const { prisma, rows } = stubPrisma([row({ retryCount: 2 })]);
    const repository = new PrismaInteractionQueueRepository(prisma);
    const nextRetryAt = new Date('2026-08-25T12:30:00.000Z');

    await repository.incrementRetry('queue-1', nextRetryAt, 'Delivery failed');

    expect(rows[0].retryCount).toBe(3);
    expect(rows[0].nextRetryAt).toEqual(nextRetryAt);
    expect(rows[0].failureReason).toBe('Delivery failed');
    expect(rows[0].status).toBe('pending');
  });
});
