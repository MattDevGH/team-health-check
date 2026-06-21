/**
 * Tests for GET/PUT /api/teams/[teamId]/schedule
 * Requirements: 3.1, 20.6
 */

import { describe, it, expect } from 'vitest';
import { GET, PUT, _testRepos as repos } from './route';

describe('GET /api/teams/[teamId]/schedule', () => {
  it('returns null schedule when none configured', async () => {
    const team = await repos.team.create({ name: 'No Schedule Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.schedule).toBeNull();
  });

  it('returns existing schedule for team', async () => {
    const team = await repos.team.create({ name: 'Scheduled Team' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'Europe/London',
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.schedule).not.toBeNull();
    expect(body.schedule.cadence).toBe('weekly');
    expect(body.schedule.openDay).toBe(1);
    expect(body.schedule.openTime).toBe('09:00');
    expect(body.schedule.closeDay).toBe(5);
    expect(body.schedule.closeTime).toBe('17:00');
    expect(body.schedule.timezone).toBe('Europe/London');
  });
});

describe('PUT /api/teams/[teamId]/schedule', () => {
  it('returns 403 when x-user-id header is missing', async () => {
    const team = await repos.team.create({ name: 'No Auth Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cadence: 'weekly',
        openDay: 1,
        openTime: '09:00',
        closeDay: 5,
        closeTime: '17:00',
      }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PUT(request, context);
    expect(response.status).toBe(403);
  });

  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'No DM Schedule Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });

    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': member.id,
      },
      body: JSON.stringify({
        cadence: 'weekly',
        openDay: 1,
        openTime: '09:00',
        closeDay: 5,
        closeTime: '17:00',
      }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PUT(request, context);
    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid schedule data', async () => {
    const team = await repos.team.create({ name: 'Invalid Schedule Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': member.id,
      },
      body: JSON.stringify({
        cadence: 'daily', // invalid — only 'weekly' is allowed
        openDay: 8, // invalid — max 6
        openTime: 'not-a-time',
        closeDay: 1,
        closeTime: '17:00',
      }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PUT(request, context);
    expect(response.status).toBe(400);
  });

  it('configures schedule for delivery_manager', async () => {
    const team = await repos.team.create({ name: 'DM Schedule Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': member.id,
      },
      body: JSON.stringify({
        cadence: 'weekly',
        openDay: 1,
        openTime: '09:00',
        closeDay: 5,
        closeTime: '17:00',
        timezone: 'America/New_York',
      }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PUT(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.schedule.cadence).toBe('weekly');
    expect(body.schedule.openDay).toBe(1);
    expect(body.schedule.timezone).toBe('America/New_York');
  });

  it('includes warning when session duration < 24 hours', async () => {
    const team = await repos.team.create({ name: 'Short Session Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm2@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': member.id,
      },
      body: JSON.stringify({
        cadence: 'weekly',
        openDay: 1,
        openTime: '09:00',
        closeDay: 1,
        closeTime: '17:00', // Same day = 8 hours
      }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PUT(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.warning).toBeDefined();
    expect(body.warning).toContain('less than 24 hours');
  });
});
