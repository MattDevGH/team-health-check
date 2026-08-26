import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/container-production', async () => {
  const { createContainer } = await import('@/lib/container');
  const { createInMemoryRepositories } = await import('@/lib/repositories');
  const repos = createInMemoryRepositories();

  return { container: createContainer(repos), repos };
});

import { PATCH, _repos } from './route';

async function createDeliveryManagerSession(
  teamId: string,
): Promise<{ memberId: string; token: string }> {
  const member = await _repos.teamMember.create({
    teamId,
    name: 'Delivery Manager',
    email: `manager-${crypto.randomUUID()}@example.com`,
  });
  await _repos.teamMemberRole.assign({
    memberId: member.id,
    teamId,
    role: 'delivery_manager',
  });
  const token = `session-${crypto.randomUUID()}`;
  await _repos.userSession.create({
    memberId: member.id,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { memberId: member.id, token };
}

function patchTeam(teamId: string, token: string, body: object): Promise<Response> {
  const request = new NextRequest(`http://localhost/api/teams/${teamId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      cookie: `session=${token}`,
    },
    body: JSON.stringify(body),
  });

  return PATCH(request, { params: Promise.resolve({ teamId }) });
}

describe('PATCH /api/teams/[teamId] delivery window', () => {
  it('persists and audits the Slack delivery window with the authenticated actor', async () => {
    const team = await _repos.team.create({ name: `Delivery Window ${crypto.randomUUID()}` });
    const { memberId, token } = await createDeliveryManagerSession(team.id);

    const response = await patchTeam(team.id, token, {
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '17:00',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '17:00',
    });
    await expect(_repos.team.findById(team.id)).resolves.toMatchObject({
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '17:00',
    });
    await expect(_repos.auditLog.findByTeamId(team.id)).resolves.toEqual([
      expect.objectContaining({
        changeType: 'delivery_window_change',
        previousValue: JSON.stringify({
          slackDeliveryStart: null,
          slackDeliveryEnd: null,
        }),
        newValue: JSON.stringify({
          slackDeliveryStart: '09:00',
          slackDeliveryEnd: '17:00',
        }),
        userId: memberId,
      }),
    ]);
  });

  it('rejects a half-configured delivery window without persisting or auditing', async () => {
    const team = await _repos.team.create({ name: `Invalid Window ${crypto.randomUUID()}` });
    const { token } = await createDeliveryManagerSession(team.id);

    const response = await patchTeam(team.id, token, { slackDeliveryStart: '09:00' });

    expect(response.status).toBe(400);
    await expect(_repos.team.findById(team.id)).resolves.toMatchObject({
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
    });
    await expect(_repos.auditLog.findByTeamId(team.id)).resolves.toEqual([]);
  });
});

describe('PATCH /api/teams/[teamId] privacy mode', () => {
  it('persists and audits a confirmed privacy-mode change', async () => {
    const team = await _repos.team.create({ name: `Privacy Mode ${crypto.randomUUID()}` });
    const { memberId, token } = await createDeliveryManagerSession(team.id);

    const response = await patchTeam(team.id, token, { privacyMode: 'attributed' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ privacyMode: 'attributed' });
    await expect(_repos.team.findById(team.id)).resolves.toMatchObject({
      privacyMode: 'attributed',
    });
    await expect(_repos.auditLog.findByTeamId(team.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: 'privacy_mode_changed',
          previousValue: 'anonymous',
          newValue: 'attributed',
          userId: memberId,
        }),
      ]),
    );
  });

  it('does not change privacy when the combined delivery window is invalid', async () => {
    const team = await _repos.team.create({ name: `Atomic Settings ${crypto.randomUUID()}` });
    const { token } = await createDeliveryManagerSession(team.id);

    const response = await patchTeam(team.id, token, {
      privacyMode: 'attributed',
      slackDeliveryStart: '09:00',
    });

    expect(response.status).toBe(400);
    await expect(_repos.team.findById(team.id)).resolves.toMatchObject({
      privacyMode: 'anonymous',
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
    });
    await expect(_repos.auditLog.findByTeamId(team.id)).resolves.toEqual([]);
  });
});
