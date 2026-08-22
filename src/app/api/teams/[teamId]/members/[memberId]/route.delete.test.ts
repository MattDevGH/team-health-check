import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { DELETE, _repos as repos } from './route';

async function setupActor(role: 'delivery_manager' | 'team_member') {
  const team = await repos.team.create({ name: `Remove ${crypto.randomUUID()}` });
  const actor = await repos.teamMember.create({ teamId: team.id, name: `Actor ${crypto.randomUUID()}` });
  await repos.teamMemberRole.assign({ memberId: actor.id, teamId: team.id, role });
  const token = crypto.randomUUID();
  await repos.userSession.create({ memberId: actor.id, token, expiresAt: new Date(Date.now() + 60_000) });
  return { team, actor, token };
}

function request(teamId: string, memberId: string, token?: string) {
  return DELETE(new NextRequest(`http://localhost/api/teams/${teamId}/members/${memberId}`, {
    method: 'DELETE',
    headers: token ? { cookie: `session=${token}` } : undefined,
  }), { params: Promise.resolve({ teamId, memberId }) });
}

describe('DELETE member', () => {
  it('returns 401 without authentication', async () => {
    expect((await request('team', 'member')).status).toBe(401);
  });

  it('returns 403 for non-manager and wrong-team actors', async () => {
    const regular = await setupActor('team_member');
    expect((await request(regular.team.id, regular.actor.id, regular.token)).status).toBe(403);
    const manager = await setupActor('delivery_manager');
    expect((await request(regular.team.id, regular.actor.id, manager.token)).status).toBe(403);
  });

  it('returns 404 for a missing or wrong-team target', async () => {
    const manager = await setupActor('delivery_manager');
    expect((await request(manager.team.id, 'missing', manager.token)).status).toBe(404);
    const other = await setupActor('team_member');
    expect((await request(manager.team.id, other.actor.id, manager.token)).status).toBe(404);
  });

  it('rejects removal of the final delivery manager', async () => {
    const manager = await setupActor('delivery_manager');
    const response = await request(manager.team.id, manager.actor.id, manager.token);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('removes a member for a same-team delivery manager', async () => {
    const manager = await setupActor('delivery_manager');
    const target = await repos.teamMember.create({ teamId: manager.team.id, name: 'Remove target' });
    await repos.teamMemberRole.assign({ memberId: target.id, teamId: manager.team.id, role: 'team_member' });

    const response = await request(manager.team.id, target.id, manager.token);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: true });
    expect(await repos.teamMember.findById(target.id)).toBeNull();
  });
});
