/**
 * Tests for GET/PATCH /api/teams/[teamId]/sessions/[sessionId]
 * Requirements: 3.5, 3.9, 19.2
 */

import { describe, it, expect } from 'vitest';
import { GET, PATCH, _testRepos as repos } from './route';

describe('GET /api/teams/[teamId]/sessions/[sessionId]', () => {
  it('returns 404 when session does not exist', async () => {
    const team = await repos.team.create({ name: 'Get Session Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/non-existent`);
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: 'non-existent' }) };

    const response = await GET(request, context);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns session details when session exists', async () => {
    const team = await repos.team.create({ name: 'Get Detail Team' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/${session.id}`);
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: session.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(session.id);
    expect(body.teamId).toBe(team.id);
    expect(body.status).toBe('open');
  });
});

describe('PATCH /api/teams/[teamId]/sessions/[sessionId]', () => {
  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'Close No DM Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: session.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });

  it('closes an open session when called by delivery_manager', async () => {
    const team = await repos.team.create({ name: 'Close Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm@close.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: session.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.closed).toBe(true);
  });

  it('returns 409 when session is already closed (Req 3.9)', async () => {
    const team = await repos.team.create({ name: 'Already Closed Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM2', email: 'dm2@close.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: session.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error.code).toBe('CONFLICT');
  });

  it('returns 404 when session does not exist', async () => {
    const team = await repos.team.create({ name: 'No Session Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM3', email: 'dm3@close.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/non-existent`, {
      method: 'PATCH',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: 'non-existent' }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(404);
  });

  it('returns 403 when x-user-id header is missing', async () => {
    const team = await repos.team.create({ name: 'No Header Close Team' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions/${session.id}`, {
      method: 'PATCH',
    });
    const context = { params: Promise.resolve({ teamId: team.id, sessionId: session.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });
});
