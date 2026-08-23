import type { PrismaClient } from '@/generated/prisma';
import { ConflictError } from '@/lib/errors';
import type { CreateTeamWithCreatorData } from '@/lib/repositories/types';
import { describe, expect, it, vi } from 'vitest';

import { PrismaTeamRepository } from './team.repository';

const aggregate: CreateTeamWithCreatorData = {
  team: { name: 'Atomic Team', description: 'Complete or absent' },
  creator: {
    id: 'creator-1',
    name: 'creator-1',
    role: 'delivery_manager',
  },
  audit: {
    changeType: 'team_created',
    previousValue: '',
    newValue: JSON.stringify({ name: 'Atomic Team' }),
    userId: 'creator-1',
  },
};

describe('PrismaTeamRepository.createWithCreator', () => {
  it('creates the complete team graph in one transaction', async () => {
    const teamRecord = {
      id: 'team-1',
      name: 'Atomic Team',
      description: 'Complete or absent',
      privacyMode: 'anonymous',
      archived: false,
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
      timezone: 'Europe/London',
      preSessionRecipient: 'delivery_manager',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transactionClient = {
      team: { create: vi.fn().mockResolvedValue(teamRecord) },
      teamMember: { create: vi.fn().mockResolvedValue({}) },
      teamMemberRole: { create: vi.fn().mockResolvedValue({}) },
      auditLogEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    const transaction = vi.fn(
      (operation: (client: typeof transactionClient) => Promise<unknown>) =>
        operation(transactionClient),
    );
    const repo = new PrismaTeamRepository({
      $transaction: transaction,
    } as unknown as PrismaClient);

    await expect(repo.createWithCreator(aggregate)).resolves.toMatchObject({
      id: 'team-1',
      name: 'Atomic Team',
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionClient.teamMember.create).toHaveBeenCalledWith({
      data: {
        id: 'creator-1',
        teamId: 'team-1',
        name: 'creator-1',
        email: null,
      },
    });
    expect(transactionClient.teamMemberRole.create).toHaveBeenCalledWith({
      data: {
        memberId: 'creator-1',
        teamId: 'team-1',
        role: 'delivery_manager',
      },
    });
    expect(transactionClient.auditLogEntry.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', ...aggregate.audit },
    });
  });

  it('maps a duplicate creator claim to ConflictError after rollback', async () => {
    const uniqueConflict = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const repo = new PrismaTeamRepository({
      $transaction: vi.fn().mockRejectedValue(uniqueConflict),
    } as unknown as PrismaClient);

    await expect(repo.createWithCreator(aggregate)).rejects.toEqual(
      expect.objectContaining({
        constructor: ConflictError,
        message: 'Team member already belongs to a team',
      }),
    );
  });
});
