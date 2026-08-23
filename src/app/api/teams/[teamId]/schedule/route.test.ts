/**
 * Tests for GET/PUT /api/teams/[teamId]/schedule.
 * Requirements: 2.1, 3.1, 9.1, 9.4, 20.6
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET, PUT, _testRepos as repos } from './route';

const validSchedule = {
  cadence: 'weekly',
  openDay: 1,
  openTime: '09:00',
  closeDay: 5,
  closeTime: '17:00',
  timezone: 'Europe/London',
};

async function createSession(teamId: string, role: 'delivery_manager' | 'team_member') {
  const member = await repos.teamMember.create({
    teamId,
    name: `${role}-${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  await repos.teamMemberRole.assign({ memberId: member.id, teamId, role });
  const token = `session-${crypto.randomUUID()}`;
  await repos.userSession.create({
    memberId: member.id,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
}

function request(
  teamId: string,
  method: 'GET' | 'PUT',
  token?: string,
  body: unknown = validSchedule,
): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cookie', `session=${token}`);
  if (method === 'PUT') headers.set('Content-Type', 'application/json');

  return new NextRequest(`http://localhost/api/teams/${teamId}/schedule`, {
    method,
    headers,
    ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}),
  });
}

function context(teamId: string) {
  return { params: Promise.resolve({ teamId }) };
}

describe('GET /api/teams/[teamId]/schedule', () => {
  it('returns 401 without an authenticated session', async () => {
    const team = await repos.team.create({ name: 'Unauthenticated Schedule' });

    const response = await GET(request(team.id, 'GET'), context(team.id));

    expect(response.status).toBe(401);
  });

  it('returns null when an authenticated team member has no schedule', async () => {
    const team = await repos.team.create({ name: 'No Schedule Team' });
    const token = await createSession(team.id, 'team_member');

    const response = await GET(request(team.id, 'GET', token), context(team.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ schedule: null });
  });

  it('returns an existing schedule to an authenticated team member', async () => {
    const team = await repos.team.create({ name: 'Scheduled Team' });
    const token = await createSession(team.id, 'team_member');
    await repos.teamSchedule.create({ teamId: team.id, ...validSchedule });

    const response = await GET(request(team.id, 'GET', token), context(team.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schedule: validSchedule,
    });
  });
});

describe('PUT /api/teams/[teamId]/schedule', () => {
  it('returns 401 without an authenticated session', async () => {
    const team = await repos.team.create({ name: 'No Auth Team' });

    const response = await PUT(request(team.id, 'PUT'), context(team.id));

    expect(response.status).toBe(401);
  });

  it('returns 403 when the authenticated member lacks the Delivery Manager role', async () => {
    const team = await repos.team.create({ name: 'No DM Schedule Team' });
    const token = await createSession(team.id, 'team_member');

    const response = await PUT(request(team.id, 'PUT', token), context(team.id));

    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid schedule data', async () => {
    const team = await repos.team.create({ name: 'Invalid Schedule Team' });
    const token = await createSession(team.id, 'delivery_manager');

    const response = await PUT(request(team.id, 'PUT', token, {
      ...validSchedule,
      cadence: 'daily',
      openDay: 8,
      openTime: 'not-a-time',
    }), context(team.id));

    expect(response.status).toBe(400);
  });

  it('persists a schedule for an authenticated Delivery Manager', async () => {
    const team = await repos.team.create({ name: 'DM Schedule Team' });
    const token = await createSession(team.id, 'delivery_manager');
    const schedule = { ...validSchedule, openDay: 2, timezone: 'America/New_York' };

    const response = await PUT(request(team.id, 'PUT', token, schedule), context(team.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ schedule });
    await expect(repos.teamSchedule.findByTeamId(team.id)).resolves.toMatchObject(schedule);
  });

  it('includes a warning when session duration is less than 24 hours', async () => {
    const team = await repos.team.create({ name: 'Short Session Team' });
    const token = await createSession(team.id, 'delivery_manager');

    const response = await PUT(request(team.id, 'PUT', token, {
      ...validSchedule,
      closeDay: 1,
      closeTime: '17:00',
    }), context(team.id));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      warning: expect.stringContaining('less than 24 hours'),
    });
  });
});
