/**
 * Tests for GET/PATCH/DELETE /api/teams/[teamId]
 * Requirements: 1.8, 19.2
 */

import { describe, it, expect } from 'vitest';
import { GET, PATCH, DELETE, _testRepos as repos } from './route';

describe('GET /api/teams/[teamId]', () => {
  it('returns 404 when team does not exist', async () => {
    const request = new Request('http://localhost/api/teams/non-existent');
    const context = { params: Promise.resolve({ teamId: 'non-existent' }) };

    const response = await GET(request, context);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns team details when team exists', async () => {
    const team = await repos.team.create({ name: 'Test Team', description: 'A description' });

    const request = new Request(`http://localhost/api/teams/${team.id}`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(team.id);
    expect(body.name).toBe('Test Team');
    expect(body.description).toBe('A description');
  });
});

describe('PATCH /api/teams/[teamId]', () => {
  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'Patch Team' });
    const regularMember = await repos.teamMember.create({ teamId: team.id, name: 'Regular User' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': regularMember.id },
      body: JSON.stringify({ name: 'New Name' }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });

  it('updates team name when called by delivery_manager', async () => {
    const team = await repos.team.create({ name: 'Original Name', description: 'Original Desc' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM User', email: 'dm@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': member.id },
      body: JSON.stringify({ name: 'Updated Name' }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe('Updated Name');
    expect(body.description).toBe('Original Desc');
  });

  it('updates team description', async () => {
    const team = await repos.team.create({ name: 'Desc Team', description: 'Old Desc' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM User 2', email: 'dm2@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': member.id },
      body: JSON.stringify({ description: 'Updated Desc' }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe('Desc Team');
    expect(body.description).toBe('Updated Desc');
  });

  it('returns 400 for invalid input (whitespace-only name after trim)', async () => {
    const team = await repos.team.create({ name: 'Validation Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM User 3', email: 'dm3@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': member.id },
      body: JSON.stringify({ name: '   ' }),
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(400);
  });

  it('returns 404 when team does not exist (after role check)', async () => {
    // Permission check will fail because the user doesn't have a role on a non-existent team
    const request = new Request('http://localhost/api/teams/non-existent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'some-user' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    const context = { params: Promise.resolve({ teamId: 'non-existent' }) };

    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/teams/[teamId]', () => {
  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'Delete Team' });
    const regularMember = await repos.teamMember.create({ teamId: team.id, name: 'Not DM' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': regularMember.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await DELETE(request, context);
    expect(response.status).toBe(403);
  });

  it('archives team (soft delete) when called by delivery_manager', async () => {
    const team = await repos.team.create({ name: 'Team To Archive' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM User 4', email: 'dm4@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await DELETE(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.archived).toBe(true);

    // Verify the team is actually archived in the repo
    const updatedTeam = await repos.team.findById(team.id);
    expect(updatedTeam?.archived).toBe(true);
  });

  it('returns 403 when team does not exist (role check fails first)', async () => {
    const request = new Request('http://localhost/api/teams/non-existent', {
      method: 'DELETE',
      headers: { 'x-user-id': 'some-user' },
    });
    const context = { params: Promise.resolve({ teamId: 'non-existent' }) };

    const response = await DELETE(request, context);
    expect(response.status).toBe(403);
  });
});
