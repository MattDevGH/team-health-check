import { beforeEach, describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import type { Team } from '@/lib/repositories/entities';
import { createTeamService, type TeamService } from '@/lib/services/team.service';

describe('TeamService.update delivery window', () => {
  let repos: Repositories;
  let service: TeamService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    service = createTeamService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
      sessionRepo: repos.session,
    });
  });

  async function createTeamWithWindow(
    slackDeliveryStart: string | null,
    slackDeliveryEnd: string | null,
  ): Promise<Team> {
    const team = await repos.team.create({ name: 'Delivery Window Team' });
    return repos.team.update(team.id, { slackDeliveryStart, slackDeliveryEnd });
  }

  it('audits the previous and new delivery window with the authenticated actor', async () => {
    const team = await createTeamWithWindow('08:00', '16:00');

    await service.update(
      team.id,
      { slackDeliveryStart: '09:00', slackDeliveryEnd: '17:00' },
      'manager-1',
    );

    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([
      expect.objectContaining({
        changeType: 'delivery_window_change',
        previousValue: JSON.stringify({
          slackDeliveryStart: '08:00',
          slackDeliveryEnd: '16:00',
        }),
        newValue: JSON.stringify({
          slackDeliveryStart: '09:00',
          slackDeliveryEnd: '17:00',
        }),
        userId: 'manager-1',
      }),
    ]);
  });

  it.each([
    {
      name: 'setting only a start on an empty window',
      initial: { slackDeliveryStart: null, slackDeliveryEnd: null },
      patch: { slackDeliveryStart: '09:00' },
    },
    {
      name: 'clearing only the end of a complete window',
      initial: { slackDeliveryStart: '09:00', slackDeliveryEnd: '17:00' },
      patch: { slackDeliveryEnd: null },
    },
  ])('rejects $name without persisting or auditing', async ({ initial, patch }) => {
    const team = await createTeamWithWindow(
      initial.slackDeliveryStart,
      initial.slackDeliveryEnd,
    );

    await expect(service.update(team.id, patch, 'manager-1')).rejects.toThrow(ValidationError);
    await expect(repos.team.findById(team.id)).resolves.toMatchObject(initial);
    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([]);
  });

  it('merges a partial update with the existing complete window', async () => {
    const team = await createTeamWithWindow('09:00', '17:00');

    await expect(
      service.update(team.id, { slackDeliveryStart: '10:00' }, 'manager-1'),
    ).resolves.toMatchObject({
      slackDeliveryStart: '10:00',
      slackDeliveryEnd: '17:00',
    });
  });

  it('allows both delivery times to be cleared together', async () => {
    const team = await createTeamWithWindow('09:00', '17:00');

    await expect(
      service.update(
        team.id,
        { slackDeliveryStart: null, slackDeliveryEnd: null },
        'manager-1',
      ),
    ).resolves.toMatchObject({
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
    });
  });

  it('does not audit an unchanged delivery window', async () => {
    const team = await createTeamWithWindow('09:00', '17:00');

    await service.update(
      team.id,
      { slackDeliveryStart: '09:00', slackDeliveryEnd: '17:00' },
      'manager-1',
    );

    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([]);
  });
});
