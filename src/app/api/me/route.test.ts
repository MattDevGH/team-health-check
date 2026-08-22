/**
 * Tests for /api/me/* route handlers (auth-migrated)
 * Requirements: 13.1, 15.1, 15.2, 12.1, 12.7, 17.1, 2.1, 2.4, 2.6, NFR 4.3
 *
 * All routes now use cookie-based auth via getAuthContext.
 * Tests verify: no cookie → 401, valid cookie → correct operation.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _repos as meRepos } from './route';
import { PATCH, _repos as prefsRepos } from './preferences/route';
import {
  POST as PostAvailability,
  DELETE as DeleteAvailability,
  _repos as availRepos,
} from './availability/route';
import { GET as GetStreak, _repos as streakRepos } from './streak/route';
import { DELETE as DeleteSlackLink, _repos as slackLinkRepos } from './slack-link/route';
import { POST as PostDeleteData, _repos as deleteRepos } from './delete-data/route';

/**
 * Helper: build a NextRequest with optional session cookie and body.
 */
function makeAuthRequest(
  method: string,
  opts: { cookie?: string; body?: unknown; url?: string } = {},
): NextRequest {
  const url = opts.url ?? 'http://localhost/api/me';
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.cookie) {
    headers.set('cookie', `session=${opts.cookie}`);
  }
  const init: { method: string; headers: Headers; body?: string } = { method, headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new NextRequest(url, init);
}

/**
 * Helper: create a valid session in the userSession repo and return the token.
 */
async function createSession(
  repos: { userSession: { create: (data: { memberId: string; token: string; expiresAt: Date }) => Promise<unknown> } },
  memberId: string,
): Promise<string> {
  const token = `session-token-${Date.now()}-${Math.random()}`;
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + 60_000), // 1 minute in the future
  });
  return token;
}

// ─── GET /api/me ───────────────────────────────────────────────────────────────

describe('GET /api/me', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('GET');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const req = makeAuthRequest('GET', { cookie: 'invalid-token' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when member does not exist (valid cookie, unknown member)', async () => {
    const token = await createSession(meRepos, 'nonexistent-member');
    const req = makeAuthRequest('GET', { cookie: token });
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns member profile with valid session cookie', async () => {
    const member = await meRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Alice',
      email: 'alice@example.com',
    });
    const token = await createSession(meRepos, member.id);

    const req = makeAuthRequest('GET', { cookie: token });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.email).toBe('alice@example.com');
  });
});

// ─── PATCH /api/me/preferences ─────────────────────────────────────────────────

describe('PATCH /api/me/preferences', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('PATCH', { body: { cadencePreference: 'session' } });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when member does not exist', async () => {
    const token = await createSession(prefsRepos, 'nonexistent');
    const req = makeAuthRequest('PATCH', {
      cookie: token,
      body: { cadencePreference: 'session' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid cadence preference', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Bob',
      email: 'bob@example.com',
    });
    const token = await createSession(prefsRepos, member.id);

    const req = makeAuthRequest('PATCH', {
      cookie: token,
      body: { cadencePreference: 'invalid' },
    });
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
    const token = await createSession(prefsRepos, member.id);

    const req = makeAuthRequest('PATCH', {
      cookie: token,
      body: { remindersEnabled: 'yes' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('updates cadence preference with valid cookie', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Dave',
      email: 'dave@example.com',
    });
    const token = await createSession(prefsRepos, member.id);

    const req = makeAuthRequest('PATCH', {
      cookie: token,
      body: { cadencePreference: 'micro_pulse' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cadencePreference).toBe('micro_pulse');
  });

  it('updates reminders enabled with valid cookie', async () => {
    const member = await prefsRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Eve',
      email: 'eve@example.com',
    });
    const token = await createSession(prefsRepos, member.id);

    const req = makeAuthRequest('PATCH', {
      cookie: token,
      body: { remindersEnabled: false },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remindersEnabled).toBe(false);
  });
});

// ─── POST /api/me/availability ──────────────────────────────────────────────────

describe('POST /api/me/availability', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('POST', {
      body: { awayFrom: '2025-01-01', awayUntil: '2025-01-05' },
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when member does not exist', async () => {
    const token = await createSession(availRepos, 'nonexistent');
    const req = makeAuthRequest('POST', {
      cookie: token,
      body: { awayFrom: '2025-01-01', awayUntil: '2025-01-05' },
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when dates are missing', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Frank',
      email: 'frank@example.com',
    });
    const token = await createSession(availRepos, member.id);

    const req = makeAuthRequest('POST', { cookie: token, body: {} });
    const res = await PostAvailability(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when awayUntil is before awayFrom', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Grace',
      email: 'grace@example.com',
    });
    const token = await createSession(availRepos, member.id);

    const req = makeAuthRequest('POST', {
      cookie: token,
      body: { awayFrom: '2025-01-10', awayUntil: '2025-01-05' },
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(400);
  });

  it('marks member as away with valid cookie', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Heidi',
      email: 'heidi@example.com',
    });
    const token = await createSession(availRepos, member.id);

    const req = makeAuthRequest('POST', {
      cookie: token,
      body: { awayFrom: '2025-01-01T00:00:00Z', awayUntil: '2025-01-10T00:00:00Z' },
    });
    const res = await PostAvailability(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.memberId).toBe(member.id);
  });
});

// ─── DELETE /api/me/availability ────────────────────────────────────────────────

describe('DELETE /api/me/availability', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('DELETE', { body: { availabilityId: 'some-id' } });
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when availabilityId is missing', async () => {
    const token = await createSession(availRepos, 'member-1');
    const req = makeAuthRequest('DELETE', { cookie: token, body: {} });
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(400);
  });

  it('removes availability with valid cookie', async () => {
    const member = await availRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Ivan',
      email: 'ivan@example.com',
    });
    const token = await createSession(availRepos, member.id);

    const availability = await availRepos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2025-01-01'),
      awayUntil: new Date('2025-01-10'),
    });

    const req = makeAuthRequest('DELETE', {
      cookie: token,
      body: { availabilityId: availability.id },
    });
    const res = await DeleteAvailability(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── GET /api/me/streak ─────────────────────────────────────────────────────────

describe('GET /api/me/streak', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('GET');
    const res = await GetStreak(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns streak for existing member with valid cookie', async () => {
    await streakRepos.team.create({ name: 'Team Streak' });
    const teams = await streakRepos.team.list();
    const team = teams[teams.length - 1];

    const member = await streakRepos.teamMember.create({
      teamId: team.id,
      name: 'Judy',
      email: 'judy@example.com',
    });
    const token = await createSession(streakRepos, member.id);

    const req = makeAuthRequest('GET', { cookie: token });
    const res = await GetStreak(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('current');
    expect(body).toHaveProperty('best');
    expect(body.current).toBe(0);
    expect(body.best).toBe(0);
  });
});

// ─── DELETE /api/me/slack-link ───────────────────────────────────────────────────

describe('DELETE /api/me/slack-link', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('DELETE');
    const res = await DeleteSlackLink(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns success with valid session cookie', async () => {
    const token = await createSession(slackLinkRepos, 'member-1');
    const req = makeAuthRequest('DELETE', { cookie: token });
    const res = await DeleteSlackLink(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── POST /api/me/delete-data ───────────────────────────────────────────────────

describe('POST /api/me/delete-data', () => {
  it('returns 401 when no session cookie is present', async () => {
    const req = makeAuthRequest('POST', { body: { confirm: true } });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when member does not exist', async () => {
    const token = await createSession(deleteRepos, 'nonexistent');
    const req = makeAuthRequest('POST', { cookie: token, body: { confirm: true } });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when confirmation is missing', async () => {
    const member = await deleteRepos.teamMember.create({
      teamId: 'team-1',
      name: 'Karl',
      email: 'karl@example.com',
    });
    const token = await createSession(deleteRepos, member.id);

    const req = makeAuthRequest('POST', { cookie: token, body: {} });
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
    const token = await createSession(deleteRepos, member.id);

    const req = makeAuthRequest('POST', { cookie: token, body: { confirm: false } });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(400);
  });

  it('deletes data successfully with confirmation and valid cookie', async () => {
    await deleteRepos.team.create({ name: 'Team Delete' });
    const teams = await deleteRepos.team.list();
    const team = teams[teams.length - 1];

    const member = await deleteRepos.teamMember.create({
      teamId: team.id,
      name: 'Mallory',
      email: 'mallory@example.com',
    });
    const token = await createSession(deleteRepos, member.id);

    const req = makeAuthRequest('POST', { cookie: token, body: { confirm: true } });
    const res = await PostDeleteData(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
