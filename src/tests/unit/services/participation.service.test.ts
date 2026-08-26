import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import {
  createParticipationService,
  type ParticipationService,
} from '@/lib/services/participation.service';

describe('ParticipationService.get', () => {
  let repos: Repositories;
  let service: ParticipationService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    service = createParticipationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      teamMemberRoleRepo: repos.teamMemberRole,
      sessionRepo: repos.session,
      responseRepo: repos.response,
    });
  });

  it('counts unique responders without exposing response details', async () => {
    const team = await repos.team.create({ name: 'Counts Team', privacyMode: 'attributed' });
    const requester = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const nonResponder = await repos.teamMember.create({ teamId: team.id, name: 'Bob' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.response.upsert({
      memberId: requester.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 5,
      trendIndicator: 'improving',
    });
    await repos.response.upsert({
      memberId: requester.id,
      sessionId: session.id,
      questionId: 'q2',
      score: 2,
      trendIndicator: 'declining',
    });

    const result = await service.get(team.id, session.id, requester.id);

    expect(result).toEqual({
      totalCount: 2,
      respondedCount: 1,
      nonResponders: [{ id: nonResponder.id, name: 'Bob' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/score|trendIndicator/);
  });

  it('shows anonymous-mode non-responders only to delivery managers', async () => {
    const team = await repos.team.create({ name: 'Anonymous Team', privacyMode: 'anonymous' });
    const manager = await repos.teamMember.create({ teamId: team.id, name: 'Manager' });
    const regular = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });
    await repos.teamMemberRole.assign({
      memberId: manager.id,
      teamId: team.id,
      role: 'delivery_manager',
    });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    await expect(service.get(team.id, session.id, regular.id)).resolves.toMatchObject({
      nonResponders: [],
    });
    await expect(service.get(team.id, session.id, manager.id)).resolves.toMatchObject({
      nonResponders: [
        { id: manager.id, name: 'Manager' },
        { id: regular.id, name: 'Regular' },
      ],
    });
  });

  it.each(['missing', 'foreign'])
    ('returns the same NotFoundError for a %s session', async (kind) => {
      const sessionId = kind === 'foreign'
        ? (await repos.session.create({ teamId: 'other-team', status: 'open' })).id
        : 'missing-session';

      await expect(service.get('expected-team', sessionId, 'member')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Session not found',
      });
    });
});
