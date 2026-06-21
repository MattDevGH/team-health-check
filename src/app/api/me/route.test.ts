/**
 * Tests for /api/me/* route handlers
 * Requirements: 13.1, 15.1, 15.2, 12.1, 12.7, 17.1, 2.6, NFR 4.3
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { GET, _repos as meRepos } from './route';
import { PATCH, _repos as prefsRepos } from './preferences/route';
import { POST as PostAvailability, DELETE as DeleteAvailability, _repos as availRepos } from './availability/route';
import { GET as GetStreak, _repos as streakRepos } from './streak/route';
import { DELETE as DeleteSlackLink } from './slack-link/route';
import { POST as PostDeleteData, _repos as deleteRepos } from './delete-data/route';

function makeRequest(method: string, headers: Record<string, string> = {}, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request('http://localhost/api/me', init);
}

describe('GET /api/me', () => {
  beforeEach(() => {
    // Reset repos by clearing internal stores
  });

  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when member does not exist', async () => {
    const req = makeRequest('GET', { 'x-member-id': 'nonexistent' });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns member profile on success', async () => {
    const member = await meRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Alice',
      email: 'alice@example.com',
    });
    // Need the team to exist for team creation in repo
    await meRepos.team.create({ name: 'Team 1' });

    const req = makeRequest('GET', { 'x-member-id': member.id });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.email).toBe('alice@example.com');
  });
});

describe('PATCH /api/me/preferences', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('PATCH', {}, { cadencePreference: 'session' });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when member does not exist', async () => {
    const req = makeRequest('PATCH', { 'x-member-id': 'nonexistent' }, { cadencePreference: 'session' });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid cadence preference', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Bob',
      email: 'bob@example.com',
    });

    const req = makeRequest('PATCH', { 'x-member-id': member.id }, { cadencePreference: 'invalid' });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-boolean remindersEnabled', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Carol',
      email: 'carol@example.com',
    });

    const req = makeRequest('PATCH', { 'x-member-id': member.id }, { remindersEnabled: 'yes' });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('updates cadence preference successfully', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Dave',
      email: 'dave@example.com',
    });

    const req = makeRequest('PATCH', { 'x-member-id': member.id }, { cadencePreference: 'micro_pulse' });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cadencePreference).toBe('micro_pulse');
  });

  it('updates reminders enabled successfully', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Eve',
      email: 'eve@example.com',
    });

    const req = makeRequest('PATCH', { 'x-member-id': member.id }, { remindersEnabled: false });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remindersEnabled).toBe(false);
  });
});

describe('POST /api/me/availability', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('POST', {}, { awayFrom: '2025-01-01', awayUntil: '2025-01-05' });
    const res = await PostAvailability(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when member does not exist', async () => {
    const req = makeRequest('POST', { 'x-member-id': 'nonexistent' }, { awayFrom: '2025-01-01', awayUntil: '2025-01-05' });
    const res = await PostAvailability(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when dates are missing', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Frank',
      email: 'frank@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, {});
    const res = await PostAvailability(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when awayUntil is before awayFrom', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Grace',
      email: 'grace@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, {
      awayFrom: '2025-01-10',
      awayUntil: '2025-01-05',
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(400);
  });

  it('marks member as away successfully', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Heidi',
      email: 'heidi@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, {
      awayFrom: '2025-01-01T00:00:00Z',
      awayUntil: '2025-01-10T00:00:00Z',
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.memberId).toBe(member.id);
  });
});

describe('DELETE /api/me/availability', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('DELETE', {}, { availabilityId: 'some-id' });
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when availabilityId is missing', async () => {
    const req = makeRequest('DELETE', { 'x-member-id': 'member-1' }, {});
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(400);
  });

  it('removes availability successfully', async () => {
    // Create a member and mark them away first
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Ivan',
      email: 'ivan@example.com',
    });

    const availability = await availRepos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2025-01-01'),
      awayUntil: new Date('2025-01-10'),
    });

    const req = makeRequest('DELETE', { 'x-member-id': member.id }, { availabilityId: availability.id });
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('GET /api/me/streak', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('GET');
    const res = await GetStreak(req);
    expect(res.status).toBe(400);
  });

  it('returns streak for existing member', async () => {
    await streakRepos.team.create({ name: 'Team Streak' });
    const teams = await streakRepos.team.list();
    const team = teams[teams.length - 1];

    const member = await streakRepos.teamMember.create({
      teamId: team.id,
      name: 'Judy',
      email: 'judy@example.com',
    });

    const req = makeRequest('GET', { 'x-member-id': member.id });
    const res = await GetStreak(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('current');
    expect(body).toHaveProperty('best');
    expect(body.current).toBe(0);
    expect(body.best).toBe(0);
  });
});

describe('DELETE /api/me/slack-link', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('DELETE');
    const res = await DeleteSlackLink(req);
    expect(res.status).toBe(400);
  });

  it('returns success placeholder response', async () => {
    const req = makeRequest('DELETE', { 'x-member-id': 'member-1' });
    const res = await DeleteSlackLink(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('POST /api/me/delete-data', () => {
  it('returns 400 when x-member-id header is missing', async () => {
    const req = makeRequest('POST', {}, { confirm: true });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when member does not exist', async () => {
    const req = makeRequest('POST', { 'x-member-id': 'nonexistent' }, { confirm: true });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when confirmation is missing', async () => {
    const member = await deleteRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Karl',
      email: 'karl@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, {});
    const res = await PostDeleteData(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when confirm is not true', async () => {
    const member = await deleteRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Laura',
      email: 'laura@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, { confirm: false });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(400);
  });

  it('deletes data successfully with confirmation', async () => {
    await deleteRepos.team.create({ name: 'Team Delete' });
    const teams = await deleteRepos.team.list();
    const team = teams[teams.length - 1];

    const member = await deleteRepos.teamMember.create({
      teamId: team.id,
      name: 'Mallory',
      email: 'mallory@example.com',
    });

    const req = makeRequest('POST', { 'x-member-id': member.id }, { confirm: true });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
