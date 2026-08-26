import type { PrismaClient, UserSession } from '@/generated/prisma';
import { describe, expect, it, vi } from 'vitest';

import { PrismaUserSessionRepository } from './user-session.repository';

function userSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-1',
    memberId: 'member-1',
    token: 'session-token',
    expiresAt: new Date('2026-09-01T12:00:00.000Z'),
    createdAt: new Date('2026-08-22T12:00:00.000Z'),
    ...overrides,
  };
}

describe('PrismaUserSessionRepository.shortenExpiry', () => {
  it('atomically shortens an expiry and never extends a shorter value', async () => {
    let record = userSession();
    const updateMany = vi.fn(async ({
      where,
      data,
    }: {
      where: { token: string; expiresAt: { gt: Date } };
      data: { expiresAt: Date };
    }) => {
      if (record.token === where.token && record.expiresAt > where.expiresAt.gt) {
        record = { ...record, expiresAt: data.expiresAt };
        return { count: 1 };
      }
      return { count: 0 };
    });
    const findUnique = vi.fn(async ({ where }: { where: { token: string } }) => (
      record.token === where.token ? record : null
    ));
    const prisma = {
      userSession: { updateMany, findUnique },
    } as unknown as PrismaClient;
    const repository = new PrismaUserSessionRepository(prisma);
    const earlier = new Date('2026-08-25T12:00:00.000Z');

    const shortened = await repository.shortenExpiry(record.token, earlier);
    const unchanged = await repository.shortenExpiry(
      record.token,
      new Date('2026-08-30T12:00:00.000Z'),
    );

    expect(shortened?.expiresAt).toEqual(earlier);
    expect(unchanged?.expiresAt).toEqual(earlier);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { token: record.token, expiresAt: { gt: earlier } },
      data: { expiresAt: earlier },
    });
    expect(record.expiresAt).toEqual(earlier);
  });

  it('returns null when the token no longer exists', async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const findUnique = vi.fn(async () => null);
    const prisma = {
      userSession: { updateMany, findUnique },
    } as unknown as PrismaClient;
    const repository = new PrismaUserSessionRepository(prisma);

    await expect(
      repository.shortenExpiry('missing', new Date('2026-08-25T12:00:00.000Z')),
    ).resolves.toBeNull();
  });
});

describe('PrismaUserSessionRepository.deleteByToken', () => {
  it('deletes only the exact token and treats an unknown token as a no-op', async () => {
    const tokens = new Set(['delete-me', 'keep-me']);
    const deleteMany = vi.fn(async ({ where }: { where: { token: string } }) => {
      const count = tokens.delete(where.token) ? 1 : 0;
      return { count };
    });
    const prisma = {
      userSession: { deleteMany },
    } as unknown as PrismaClient;
    const repository = new PrismaUserSessionRepository(prisma);

    await repository.deleteByToken('delete-me');
    await repository.deleteByToken('unknown-token');

    expect(tokens).toEqual(new Set(['keep-me']));
    expect(deleteMany).toHaveBeenNthCalledWith(1, { where: { token: 'delete-me' } });
    expect(deleteMany).toHaveBeenNthCalledWith(2, { where: { token: 'unknown-token' } });
  });
});


describe('PrismaUserSessionRepository.findValidByMemberId', () => {
  it('selects the latest-expiring active session', async () => {
    const later = userSession({
      token: 'later-token',
      expiresAt: new Date('2099-09-01T12:00:00.000Z'),
    });
    const findFirst = vi.fn(async () => later);
    const prisma = {
      userSession: { findFirst },
    } as unknown as PrismaClient;
    const repository = new PrismaUserSessionRepository(prisma);

    await expect(repository.findValidByMemberId('member-1')).resolves.toMatchObject({
      token: later.token,
      expiresAt: later.expiresAt,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { memberId: 'member-1', expiresAt: { gt: expect.any(Date) } },
      orderBy: { expiresAt: 'desc' },
    });
  });
});