/**
 * Tests for GET/POST /api/teams/[teamId]/members (auth-migrated)
 * Requirements: 1.3, 1.4, 1.5, 1.7, 9.1, 9.2, 19.2
 *
 * Routes now use cookie-based auth via getAuthContext + authorizeTeamMember.
 * Tests verify: no cookie → 401, wrong team → 403, correct team → 200/201.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST, _repos as repos } from './route';

/**
 * Helper: build a NextRequest with optional session cookie and body.
 */
function makeRequest(
  method: string,
  opts: { cookie?: string; teamId?: string; body?: unknown } = {},
): { req: NextRequest; ctx: { params: Promise<Record<string, string>> } } {
  const teamId = opts.teamId ?? 'team-1';
  const url = `http://localhost/api/teams/${teamId}/members`;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.cookie) {
    headers.set('cookie', `session=${opts.cookie}`);
  }
  const init: { method: string; headers: Headers; body?: string } = { method, headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  const req = new NextRequest(url, init);
  const ctx = { params: Promise.resolve({ teamId }) };
  return { req, ctx };
}

/**
 * Helper: create a valid session in the userSession repo and return the token.
 */
async function createSession(memberId: string): Promise<string> {
  const token = `session-token-${Date.now()}-${Math.random()}`;
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
}

// ─── GET /api/teams/[teamId]/members ────────────────────────────────────────────

describe('GET /api/teams/[teamId]/members', () => {
  it('returns 401 when no session cookie is present', async () => {
    const { req, ctx } = makeRequest('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const { req, ctx } = makeRequest('GET', { cookie: 'invalid-token' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when member belongs to a different team', async () => {
    await repos.team.create({ name: 'Other Team' });
    const teams = await repos.team.list();
    const otherTeam = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Alice',
      email: 'alice@members.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: 'nonexistent-team' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns list of members when authenticated and authorized', async () => {
    await repos.team.create({ name: 'Members Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Bob',
      email: 'bob@members.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── POST /api/teams/[teamId]/members ───────────────────────────────────────────

describe('POST /api/teams/[teamId]/members', () => {
  it('returns 401 when no session cookie is present', async () => {
    const { req, ctx } = makeRequest('POST', { body: { name: 'NewMember' } });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when member belongs to a different team', async () => {
    await repos.team.create({ name: 'Team A' });
    await repos.team.create({ name: 'Team B' });
    const teams = await repos.team.list();
    const teamA = teams[teams.length - 2];
    const teamB = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: teamA.id,
      name: 'Carlos',
      email: 'carlos@members.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', {
      cookie: token,
      teamId: teamB.id,
      body: { name: 'New Member' },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('adds a member with valid name and returns 201', async () => {
    await repos.team.create({ name: 'Add Member Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Dave',
      email: 'dave@members.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', {
      cookie: token,
      teamId: team.id,
      body: { name: 'Alice Smith' },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Alice Smith');
    expect(body.teamId).toBe(team.id);
  });

  it('rejects empty name with 400 validation error', async () => {
    await repos.team.create({ name: 'Validation Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Eve',
      email: 'eve@members.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', {
      cookie: token,
      teamId: team.id,
      body: { name: '' },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
