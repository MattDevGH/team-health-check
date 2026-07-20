/**
 * Tests for GET /api/teams/[teamId] route handler (auth-migrated)
 * Requirements: 2.1, 2.3, 9.1, 9.2
 *
 * Route now uses cookie-based auth via getAuthContext + authorizeTeamMember.
 * Tests verify: no cookie → 401, wrong team → 403, correct team → 200.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _repos } from './route';

/**
 * Helper: build a NextRequest with optional session cookie.
 */
function makeRequest(
  method: string,
  opts: { cookie?: string; teamId?: string } = {},
): { req: NextRequest; ctx: { params: Promise<Record<string, string>> } } {
  const teamId = opts.teamId ?? 'team-1';
  const url = `http://localhost/api/teams/${teamId}`;
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
  await _repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + 60_000), // 1 minute in the future
  });
  return token;
}

// ─── GET /api/teams/[teamId] ────────────────────────────────────────────────────

describe('GET /api/teams/[teamId]', () => {
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
    // Create a team and member belonging to a DIFFERENT team
    await _repos.team.create({ name: 'Other Team' });
    const teams = await _repos.team.list();
    const otherTeam = teams[teams.length - 1];

    const member = await _repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Alice',
      email: 'alice@example.com',
    });
    const token = await createSession(member.id);

    // Request team data for a DIFFERENT teamId
    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: 'nonexistent-team' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 with team data when member belongs to the team', async () => {
    // Create a team
    await _repos.team.create({ name: 'My Team' });
    const teams = await _repos.team.list();
    const team = teams[teams.length - 1];

    // Create a member belonging to this team
    const member = await _repos.teamMember.create({
      teamId: team.id,
      name: 'Bob',
      email: 'bob@example.com',
    });
    const token = await createSession(member.id);

    // Request team data for the member's team
    const { req, ctx } = makeRequest('GET', { cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('My Team');
    expect(body.id).toBe(team.id);
  });
});
