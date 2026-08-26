/**
 * Tests for GET /api/teams/[teamId]/audit-log (auth-migrated)
 * Requirements: 9.1, 9.2, 9.3, 9.4, 18.4, 18.5, 19.2
 *
 * Route now uses cookie-based auth via getAuthContext + authorizeDeliveryManager.
 * Tests verify: no cookie → 401, wrong team → 403, not DM → 403, DM → 200.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _repos as repos } from './route';

/**
 * Helper: build a NextRequest with optional session cookie.
 */
function makeRequest(
  opts: { cookie?: string; teamId?: string; query?: string } = {},
): { req: NextRequest; ctx: { params: Promise<Record<string, string>> } } {
  const teamId = opts.teamId ?? 'team-1';
  const query = opts.query ?? '';
  const url = `http://localhost/api/teams/${teamId}/audit-log${query}`;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.cookie) {
    headers.set('cookie', `session=${opts.cookie}`);
  }
  const req = new NextRequest(url, { method: 'GET', headers });
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

// ─── GET /api/teams/[teamId]/audit-log ──────────────────────────────────────────

describe('GET /api/teams/[teamId]/audit-log', () => {
  it('returns 401 when no session cookie is present', async () => {
    const { req, ctx } = makeRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const { req, ctx } = makeRequest({ cookie: 'invalid-token' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when member belongs to a different team', async () => {
    await repos.team.create({ name: 'Audit Other Team' });
    const teams = await repos.team.list();
    const otherTeam = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: otherTeam.id,
      name: 'Alice',
      email: 'alice@audit.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest({ cookie: token, teamId: 'wrong-team-id' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when member is on team but NOT delivery_manager', async () => {
    await repos.team.create({ name: 'Audit No DM Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Regular User',
      email: 'regular@audit.test',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest({ cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 when member is delivery_manager for the team', async () => {
    await repos.team.create({ name: 'Audit DM Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'DM User',
      email: 'dm@audit.test',
    });
    await repos.teamMemberRole.assign({
      memberId: member.id,
      teamId: team.id,
      role: 'delivery_manager',
    });
    const token = await createSession(member.id);

    const { req, ctx } = makeRequest({ cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns audit log entries most recent first', async () => {
    await repos.team.create({ name: 'Log Order Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'DM Order',
      email: 'dm-order@audit.test',
    });
    await repos.teamMemberRole.assign({
      memberId: member.id,
      teamId: team.id,
      role: 'delivery_manager',
    });
    const token = await createSession(member.id);

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

    const { req, ctx } = makeRequest({ cookie: token, teamId: team.id });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].changeType).toBe('second_change');
    expect(body[1].changeType).toBe('first_change');
  });

  it('supports limit pagination parameter', async () => {
    await repos.team.create({ name: 'Paginated Audit Team' });
    const teams = await repos.team.list();
    const team = teams[teams.length - 1];

    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'DM Paginate',
      email: 'dm-paginate@audit.test',
    });
    await repos.teamMemberRole.assign({
      memberId: member.id,
      teamId: team.id,
      role: 'delivery_manager',
    });
    const token = await createSession(member.id);

    for (let i = 0; i < 3; i++) {
      await repos.auditLog.create({
        teamId: team.id,
        changeType: `change_${i}`,
        previousValue: `prev_${i}`,
        newValue: `new_${i}`,
        userId: member.id,
      });
    }

    const { req, ctx } = makeRequest({ cookie: token, teamId: team.id, query: '?limit=2' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});
