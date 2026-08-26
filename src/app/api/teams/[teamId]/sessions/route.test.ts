/**
 * Tests for GET/POST /api/teams/[teamId]/sessions (auth-migrated)
 * Requirements: 3.5, 3.10, 9.1, 9.2, 19.2
 *
 * Routes now use cookie-based auth via getAuthContext + authorizeTeamMember.
 * Tests verify: no cookie → 401, wrong team → 403, correct team → 200/201.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, POST, _repos as repos } from './route';

/**
 * Helper: build a NextRequest with optional session cookie.
 */
function makeRequest(
  method: string,
  opts: { cookie?: string; teamId?: string } = {},
): { req: NextRequest; ctx: { params: Promise<Record<string, string>> } } {
  const teamId = opts.teamId ?? 'team-1';
  const url = `http://localhost/api/teams/${teamId}/sessions`;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.cookie) {
    headers.set('cookie', `session=${opts.cookie}`);
  }
  const req = new NextRequest(url, { method, headers });
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

// ─── GET /api/teams/[teamId]/sessions ───────────────────────────────────────────

describe('GET /api/teams/[teamId]/sessions', () => {
  it('returns 401 when no session cookie is present', async () => {
    const { req, ctx } = makeRequest('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const { req, ctx } = makeRequest('GET', { cookie: 'bad-token' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when member belongs to a different team', async () => {
    await repos.team.create({ name: 'Sessions Other Team' });
    const teams = await repos.team.list();
    const otherTeam = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Alice',
      email: 'alice@sessions.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: 'wrong-team-id' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns sessions when authenticated and authorized', async () => {
    await repos.team.create({ name: 'Sessions Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Bob',
      email: 'bob@sessions.test',
    });
    const token = await createSession(member.id);

    // Create a session for this team
    await repos.session.create({ teamId: team.id, status: 'open' });

    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── POST /api/teams/[teamId]/sessions ──────────────────────────────────────────

describe('POST /api/teams/[teamId]/sessions', () => {
  it('returns 401 when no session cookie is present', async () => {
    const { req, ctx } = makeRequest('POST');
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when member belongs to a different team', async () => {
    await repos.team.create({ name: 'Post Other Team' });
    const teams = await repos.team.list();
    const otherTeam = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Carlos',
      email: 'carlos@sessions.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', { cookie: token, teamId: 'different-team' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 403 when user lacks delivery_manager role', async () => {
    await repos.team.create({ name: 'No DM Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Regular',
      email: 'regular@sessions.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', { cookie: token, teamId: team.id });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('opens a new session when called by delivery_manager', async () => {
    await repos.team.create({ name: 'DM Sessions Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'DM',
      email: 'dm@sessions.test',
    });
    await repos.teamMemberRole.assign({
      memberId: member.id,
      teamId: team.id,
      role: 'delivery_manager',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest('POST', { cookie: token, teamId: team.id });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.teamId).toBe(team.id);
    expect(body.status).toBe('open');
  });
});
