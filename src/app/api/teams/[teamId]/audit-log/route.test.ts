/**
 * Tests for GET /api/teams/[teamId]/audit-log
 * Requirements: 18.4, 18.5, 19.2
 */

import { describe, it, expect } from 'vitest';
import { GET, _testRepos as repos } from './route';

describe('GET /api/teams/[teamId]/audit-log', () => {
  it('returns 403 when user lacks delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'Audit Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Regular User' });

    const request = new Request(`http://localhost/api/teams/${team.id}/audit-log`, {
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(403);
  });

  it('returns empty array when no audit log entries exist', async () => {
    const team = await repos.team.create({ name: 'Empty Audit Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM', email: 'dm@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    const request = new Request(`http://localhost/api/teams/${team.id}/audit-log`, {
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns audit log entries most recent first', async () => {
    const team = await repos.team.create({ name: 'Log Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM User', email: 'dm2@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    // Create entries — verify ordering is reverse chronological
    await repos.auditLog.create({
      teamId: team.id,
      changeType: 'name_change',
      previousValue: 'Old Name',
      newValue: 'New Name',
      userId: member.id,
    });

    // Wait 1ms to ensure distinct timestamps
    await new Promise(resolve => setTimeout(resolve, 2));

    await repos.auditLog.create({
      teamId: team.id,
      changeType: 'privacy_change',
      previousValue: 'anonymous',
      newValue: 'identified',
      userId: member.id,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/audit-log`, {
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(2);
    // Most recent first
    expect(body[0].changeType).toBe('privacy_change');
    expect(body[1].changeType).toBe('name_change');
  });

  it('supports limit pagination parameter', async () => {
    const team = await repos.team.create({ name: 'Paginated Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM Paginate', email: 'dmp@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    // Create 3 entries
    for (let i = 0; i < 3; i++) {
      await repos.auditLog.create({
        teamId: team.id,
        changeType: `change_${i}`,
        previousValue: `prev_${i}`,
        newValue: `new_${i}`,
        userId: member.id,
      });
    }

    const request = new Request(`http://localhost/api/teams/${team.id}/audit-log?limit=2`, {
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(2);
  });

  it('supports cursor-based pagination', async () => {
    const team = await repos.team.create({ name: 'Cursor Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'DM Cursor', email: 'dmc@test.com' });
    await repos.teamMemberRole.assign({ memberId: member.id, teamId: team.id, role: 'delivery_manager' });

    // Create entries with distinct timestamps
    await repos.auditLog.create({
      teamId: team.id,
      changeType: 'first_change',
      previousValue: 'a',
      newValue: 'b',
      userId: member.id,
    });

    await new Promise(resolve => setTimeout(resolve, 2));

    await repos.auditLog.create({
      teamId: team.id,
      changeType: 'second_change',
      previousValue: 'c',
      newValue: 'd',
      userId: member.id,
    });

    // First page: get the first entry (most recent)
    const firstRequest = new Request(`http://localhost/api/teams/${team.id}/audit-log?limit=1`, {
      headers: { 'x-user-id': member.id },
    });
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const firstResponse = await GET(firstRequest, context);
    const firstPage = await firstResponse.json();
    expect(firstPage).toHaveLength(1);
    expect(firstPage[0].changeType).toBe('second_change');

    // Second page using cursor
    const cursor = firstPage[0].id;
    const secondRequest = new Request(
      `http://localhost/api/teams/${team.id}/audit-log?limit=1&cursor=${cursor}`,
      { headers: { 'x-user-id': member.id } }
    );

    const secondResponse = await GET(secondRequest, context);
    const secondPage = await secondResponse.json();
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].changeType).toBe('first_change');
  });

  it('returns 403 when x-user-id header is missing', async () => {
    const team = await repos.team.create({ name: 'No Header Team' });

    const request = new Request(`http://localhost/api/teams/${team.id}/audit-log`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(403);
  });
});
