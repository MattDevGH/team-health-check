import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { PATCH, _repos as repos } from './route';

async function setupActor(role: 'delivery_manager' | 'team_member', teamId?: string) {
  const team = teamId ? await repos.team.findById(teamId) : await repos.team.create({ name: `Role ${crypto.randomUUID()}` });
  if (!team) throw new Error('Test team missing');
  const actor = await repos.teamMember.create({ teamId: team.id, name: `Actor ${crypto.randomUUID()}` });
  await repos.teamMemberRole.assign({ memberId: actor.id, teamId: team.id, role });
  const token = crypto.randomUUID();
  await repos.userSession.create({ memberId: actor.id, token, expiresAt: new Date(Date.now() + 60_000) });
  return { team, actor, token };
}

function request(teamId: string, memberId: string, role: string, token?: string) {
  return PATCH(new NextRequest(`http://localhost/api/teams/${teamId}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `session=${token}` } : {}) },
    body: JSON.stringify({ role }),
  }), { params: Promise.resolve({ teamId, memberId }) });
}

describe('PATCH member role', () => {
  it('returns 401 without authentication', async () => {
    expect((await request('team', 'member', 'team_member')).status).toBe(401);
  });

  it('returns 400 for an invalid role', async () => {
    const { team, actor, token } = await setupActor('delivery_manager');
    expect((await request(team.id, actor.id, 'owner', token)).status).toBe(400);
  });

  it('returns 403 for a non-manager and for a wrong-team manager', async () => {
    const memberActor = await setupActor('team_member');
    expect((await request(memberActor.team.id, memberActor.actor.id, 'delivery_manager', memberActor.token)).status).toBe(403);

    const manager = await setupActor('delivery_manager');
    expect((await request(memberActor.team.id, memberActor.actor.id, 'delivery_manager', manager.token)).status).toBe(403);
  });

  it('returns 404 when the target is missing or belongs to another team', async () => {
    const manager = await setupActor('delivery_manager');
    expect((await request(manager.team.id, 'missing', 'team_member', manager.token)).status).toBe(404);
    const other = await setupActor('team_member');
    expect((await request(manager.team.id, other.actor.id, 'team_member', manager.token)).status).toBe(404);
  });

  it('replaces a role, returns the updated DTO, and is idempotent', async () => {
    const manager = await setupActor('delivery_manager');
    const target = await repos.teamMember.create({ teamId: manager.team.id, name: 'Target' });
    await repos.teamMemberRole.assign({ memberId: target.id, teamId: manager.team.id, role: 'team_member' });

    const first = await request(manager.team.id, target.id, 'delivery_manager', manager.token);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ id: target.id, roles: [{ role: 'delivery_manager' }], slackLink: null });
    expect((await request(manager.team.id, target.id, 'delivery_manager', manager.token)).status).toBe(200);
    expect(await repos.teamMemberRole.findByMemberAndTeam(target.id, manager.team.id)).toHaveLength(1);
  });

  it('promotes a legacy roleless member to exactly one role', async () => {
    const manager = await setupActor('delivery_manager');
    const target = await repos.teamMember.create({ teamId: manager.team.id, name: 'Legacy target' });

    expect((await request(manager.team.id, target.id, 'delivery_manager', manager.token)).status).toBe(200);
    expect(await repos.teamMemberRole.findByMemberAndTeam(target.id, manager.team.id)).toHaveLength(1);
  });

  it('rejects demoting the final delivery manager', async () => {
    const manager = await setupActor('delivery_manager');
    const response = await request(manager.team.id, manager.actor.id, 'team_member', manager.token);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } });
  });
});
