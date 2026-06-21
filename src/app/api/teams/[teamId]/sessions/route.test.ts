/**
 * Tests for GET/POST /api/teams/[teamId]/sessions
 * Requirements: 3.5, 3.10, 19.2
 */

import { describe, it, expect } from 'vitest';
import { GET, POST, _testRepos as repos } from './route';

describe('GET /api/teams/[teamId]/sessions', () => {
  it('returns empty array when no sessions exist', async () => {
    const team = await repos.team.create({ name: 'Session Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns sessions for a team', async () => {
    const team = await repos.team.create({ name: 'Team With Sessions' });
    await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.session.create({ teamId: team.id, status: 'closed' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(2);
  });
});

describe('POST /api/teams/[teamId]/sessions', () => {
  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'No DM Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`, {
      method: 'POST',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await POST(request, context);
    expect(response.status).toBe(403);
  });

  it('opens a new session when called by delivery_manager', async () => {
    const team = await repos.team.create({ name: 'DM Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`, {
      method: 'POST',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await POST(request, context);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.teamId).toBe(team.id);
    expect(body.status).toBe('open');
  });

  it('closes existing open session when opening a new one (Req 3.9)', async () => {
    const team = await repos.team.create({ name: 'Auto Close Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM2', email: 'dm2@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    // Create an existing open session
    const existing = await repos.session.create({ teamId: team.id, status: 'open' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`, {
      method: 'POST',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await POST(request, context);
    expect(response.status).toBe(201);

    // Verify existing session was closed
    const updated = await repos.session.findById(existing.id);
    expect(updated?.status).toBe('closed');
  });

  it('returns 403 when x-user-id header is missing', async () => {
    const team = await repos.team.create({ name: 'No Header Team' });

    const request = new Request(`http://localhost/api/teams/${team.id}/sessions`, {
      method: 'POST',
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await POST(request, context);
    expect(response.status).toBe(403);
  });
});
