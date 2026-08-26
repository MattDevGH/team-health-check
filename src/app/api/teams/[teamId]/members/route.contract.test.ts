import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST, _repos as repos } from './route';

async function authenticatedRequest(method: 'GET' | 'POST', teamId: string, memberId: string, body?: unknown) {
  const token = crypto.randomUUID();
  await repos.userSession.create({ memberId, token, expiresAt: new Date(Date.now() + 60_000) });
  return {
    request: new NextRequest(`http://localhost/api/teams/${teamId}/members`, {
      method,
      headers: { cookie: `session=${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ teamId }) },
  };
}

describe('member collection response contract', () => {
  it('GET serializes genesis role, Slack link, and legacy defaults', async () => {
    const team = await repos.team.create({ name: `Contract ${crypto.randomUUID()}` });
    const manager = await repos.teamMember.create({ teamId: team.id, name: 'Manager' });
    await repos.teamMemberRole.assign({ memberId: manager.id, teamId: team.id, role: 'delivery_manager' });
    await repos.slackIdentityLink.create({ memberId: manager.id, slackUserId: 'U-CONTRACT' });
    const legacy = await repos.teamMember.create({ teamId: team.id, name: 'Legacy' });
    const { request, context } = await authenticatedRequest('GET', team.id, manager.id);

    const response = await GET(request, context);
    const members = await response.json();

    expect(response.status).toBe(200);
    expect(members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: manager.id, roles: [{ role: 'delivery_manager' }], slackLink: { slackUserId: 'U-CONTRACT' } }),
      expect.objectContaining({ id: legacy.id, roles: [], slackLink: null }),
    ]));
  });

  it('POST assigns team_member and returns the same renderable summary contract', async () => {
    const team = await repos.team.create({ name: `Add contract ${crypto.randomUUID()}` });
    const manager = await repos.teamMember.create({ teamId: team.id, name: 'Manager' });
    await repos.teamMemberRole.assign({ memberId: manager.id, teamId: team.id, role: 'delivery_manager' });
    const { request, context } = await authenticatedRequest('POST', team.id, manager.id, { name: 'Added' });
    request.headers.set('x-user-id', 'spoofed-actor');

    const response = await POST(request, context);
    const member = await response.json();

    expect(response.status).toBe(201);
    expect(member).toMatchObject({ teamId: team.id, name: 'Added', roles: [{ role: 'team_member' }], slackLink: null });
    expect(await repos.teamMemberRole.findByMemberAndTeam(member.id, team.id)).toHaveLength(1);
    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([
      expect.objectContaining({
        changeType: 'member_added',
        previousValue: '',
        newValue: JSON.stringify(member),
        userId: manager.id,
      }),
    ]);
  });
});

describe('POST member authorization', () => {
  it('rejects a same-team non-manager with 403', async () => {
    const team = await repos.team.create({ name: `Non-manager ${crypto.randomUUID()}` });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular actor' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'team_member' });
    const { request, context } = await authenticatedRequest('POST', team.id, member.id, { name: 'Denied' });

    expect((await POST(request, context)).status).toBe(403);
  });
});
