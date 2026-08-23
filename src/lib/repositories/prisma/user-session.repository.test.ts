import type { PrismaClient } from '@/generated/prisma';
import { describe, expect, it, vi } from 'vitest';

import { PrismaUserSessionRepository } from './user-session.repository';

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
