/**
 * PUT — a Delivery Manager asserts which Slack account belongs to a member.
 *
 * Requirements: Slack Sign In 2.1, 2.2, 2.4, NFR 1.2
 *
 * The service decides what a binding means; this is the boundary, and the
 * question it answers is who may assert one. An ordinary member binding their
 * own Slack account would be self-service identity assertion — exactly what
 * phase 3 needs a verified email to justify.
 */

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { PUT, _repos as repos } from './route';

async function setupActor(role: 'delivery_manager' | 'team_member') {
  const team = await repos.team.create({ name: `Binding ${crypto.randomUUID()}` });
  const actor = await repos.teamMember.create({
    teamId: team.id,
    name: `Actor ${crypto.randomUUID()}`,
  });
  await repos.teamMemberRole.assign({ memberId: actor.id, teamId: team.id, role });
  const token = crypto.randomUUID();
  await repos.userSession.create({
    memberId: actor.id,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { team, actor, token };
}

function request(
  teamId: string,
  memberId: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return PUT(
    new NextRequest(`http://localhost/api/teams/${teamId}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(token ? { cookie: `session=${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ teamId, memberId }) },
  );
}

describe('PUT a member Slack binding', () => {
  it('refuses without authentication', async () => {
    expect((await request('team', 'member', { slackUserId: 'U123ABC' })).status).toBe(401);
  });

  it('refuses an ordinary member, including for their own account', async () => {
    /*
     * The heart of Requirement 2.4. If a member could assert their own
     * binding, anybody in the Slack workspace who guessed a member id could
     * claim to be them — which is the self-service path phase 3 pays for with
     * a verified email, not something to get for free here.
     */
    const regular = await setupActor('team_member');

    const response = await request(
      regular.team.id,
      regular.actor.id,
      { slackUserId: 'U123ABC' },
      regular.token,
    );

    expect(response.status).toBe(403);
    expect(await repos.slackIdentityLink.findByMemberId(regular.actor.id)).toBeNull();
  });

  it('refuses a manager of a different team', async () => {
    const target = await setupActor('team_member');
    const outsider = await setupActor('delivery_manager');

    const response = await request(
      target.team.id,
      target.actor.id,
      { slackUserId: 'U123ABC' },
      outsider.token,
    );

    expect(response.status).toBe(403);
    expect(await repos.slackIdentityLink.findByMemberId(target.actor.id)).toBeNull();
  });

  it('records the binding for a manager of that team', async () => {
    const manager = await setupActor('delivery_manager');
    const slackUserId = `U${crypto.randomUUID().replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}`;

    const response = await request(
      manager.team.id,
      manager.actor.id,
      { slackUserId },
      manager.token,
    );

    expect(response.status).toBe(200);
    expect(await repos.slackIdentityLink.findByMemberId(manager.actor.id)).toMatchObject({
      slackUserId,
    });
  });

  it('clears a binding when given null', async () => {
    const manager = await setupActor('delivery_manager');
    await request(manager.team.id, manager.actor.id, { slackUserId: 'U9CLEAR9' }, manager.token);

    const response = await request(
      manager.team.id,
      manager.actor.id,
      { slackUserId: null },
      manager.token,
    );

    expect(response.status).toBe(200);
    expect(await repos.slackIdentityLink.findByMemberId(manager.actor.id)).toBeNull();
  });

  it('refuses something that could not be a Slack id', async () => {
    // Refused at the edge rather than stored and puzzled over later
    const manager = await setupActor('delivery_manager');

    const response = await request(
      manager.team.id,
      manager.actor.id,
      { slackUserId: 'not a slack id' },
      manager.token,
    );

    expect(response.status).toBe(400);
    expect(await repos.slackIdentityLink.findByMemberId(manager.actor.id)).toBeNull();
  });

  it('refuses an id already bound to another member, and keeps the original', async () => {
    const manager = await setupActor('delivery_manager');
    const colleague = await repos.teamMember.create({
      teamId: manager.team.id,
      name: `Colleague ${crypto.randomUUID()}`,
    });
    await request(manager.team.id, manager.actor.id, { slackUserId: 'U7SHARED' }, manager.token);

    const response = await request(
      manager.team.id,
      colleague.id,
      { slackUserId: 'U7SHARED' },
      manager.token,
    );

    expect(response.status).toBe(409);
    expect(await repos.slackIdentityLink.findBySlackUserId('U7SHARED')).toMatchObject({
      memberId: manager.actor.id,
    });
  });

  it('refuses a member who is not in this team', async () => {
    const manager = await setupActor('delivery_manager');
    const stranger = await setupActor('team_member');

    const response = await request(
      manager.team.id,
      stranger.actor.id,
      { slackUserId: 'U8OTHER8' },
      manager.token,
    );

    expect(response.status).toBe(404);
  });
});
