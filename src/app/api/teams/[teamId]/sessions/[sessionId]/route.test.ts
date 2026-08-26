/**
 * Tests for GET/PATCH /api/teams/[teamId]/sessions/[sessionId]
 * Requirements: 3.5, 3.9, 19.2
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createContainer, type Container } from '@/lib/container';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { PATCH, _testRepos as repos } from './route';
import { createSessionDetailRouteHandler } from './route-handlers';

function patchRequest(teamId: string, sessionId: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cookie', `session=${token}`);

  return new NextRequest(
    `http://localhost/api/teams/${teamId}/sessions/${sessionId}`,
    { method: 'PATCH', headers },
  );
}

function routeContext(teamId: string, sessionId: string) {
  return { params: Promise.resolve({ teamId, sessionId }) };
}

async function createUserSession(memberId: string, expiresAt = new Date(Date.now() + 60_000)) {
  const token = `close-${memberId}-${Date.now()}-${Math.random()}`;
  await repos.userSession.create({ memberId, token, expiresAt });
  return token;
}

async function createDeliveryManager(teamId: string, email: string) {
  const member = await repos.teamMember.create({ teamId, name: 'Delivery Manager', email });
  await repos.teamMemberRole.assign({
    memberId: member.id,
    teamId,
    role: 'delivery_manager',
  });
  return member;
}

describe('GET /api/teams/[teamId]/sessions/[sessionId]', () => {
  let detailRepos: Repositories;
  let detailContainer: Container;
  let GET: ReturnType<typeof createSessionDetailRouteHandler>;
  let authorizeTeamMember: ReturnType<typeof createAuthorizeTeamMember>;
  let getSession: Container['session']['get'];

  beforeEach(() => {
    detailRepos = createInMemoryRepositories();
    detailContainer = createContainer(detailRepos);
    authorizeTeamMember = vi.fn(
      createAuthorizeTeamMember({ teamMemberRepo: detailRepos.teamMember }),
    );
    getSession = vi.fn((teamId, sessionId) => detailContainer.session.get(teamId, sessionId));
    GET = createSessionDetailRouteHandler({
      getAuthContext: createGetAuthContext({ userSessionRepo: detailRepos.userSession }),
      authorizeTeamMember,
      getSession,
    });
  });

  async function createDetailSession(
    memberId: string,
    expiresAt = new Date(Date.now() + 60_000),
  ): Promise<string> {
    const token = `detail-${memberId}-${Date.now()}-${Math.random()}`;
    await detailRepos.userSession.create({ memberId, token, expiresAt });
    return token;
  }

  it.each([
    ['missing', undefined],
    ['unknown', 'unknown-detail-token'],
    ['expired', 'expired-detail-token'],
  ])('returns generic 401 for a %s cookie', async (kind, suppliedToken) => {
    const team = await detailRepos.team.create({ name: `Detail ${kind} Team` });
    const member = await detailRepos.teamMember.create({ teamId: team.id, name: 'Member' });
    const token = kind === 'expired'
      ? await createDetailSession(member.id, new Date(Date.now() - 1_000))
      : suppliedToken;

    const paramsAccess = vi.fn();
    const context = {
      get params() {
        paramsAccess();
        return Promise.resolve({ teamId: team.id, sessionId: 'missing' });
      },
    };
    const response = await GET(
      new NextRequest(`http://localhost/api/teams/${team.id}/sessions/missing`, {
        headers: token ? { cookie: `session=${token}` } : undefined,
      }),
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    expect(paramsAccess).not.toHaveBeenCalled();
    expect(authorizeTeamMember).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'nonexistent'])
    ('returns the same 403 for a %s requested team', async (kind) => {
      const memberTeam = await detailRepos.team.create({ name: 'Member Detail Team' });
      const member = await detailRepos.teamMember.create({ teamId: memberTeam.id, name: 'Outsider' });
      const token = await createDetailSession(member.id);
      const requestedTeamId = kind === 'foreign'
        ? (await detailRepos.team.create({ name: 'Requested Detail Team' })).id
        : 'nonexistent-team';

      const response = await GET(
        new NextRequest(`http://localhost/api/teams/${requestedTeamId}/sessions/missing`, {
          headers: { cookie: `session=${token}` },
        }),
        routeContext(requestedTeamId, 'missing'),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this team' },
      });
      expect(authorizeTeamMember).toHaveBeenCalledWith(member.id, requestedTeamId);
      expect(getSession).not.toHaveBeenCalled();
    });

  it('returns session details to an ordinary member of the requested team', async () => {
    const team = await detailRepos.team.create({ name: 'Get Detail Team' });
    const member = await detailRepos.teamMember.create({ teamId: team.id, name: 'Member' });
    const token = await createDetailSession(member.id);
    const session = await detailRepos.session.create({ teamId: team.id, status: 'open' });

    const response = await GET(
      new NextRequest(`http://localhost/api/teams/${team.id}/sessions/${session.id}`, {
        headers: { cookie: `session=${token}` },
      }),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: session.id,
      teamId: team.id,
      status: 'open',
    });
    expect(authorizeTeamMember).toHaveBeenCalledWith(member.id, team.id);
    expect(getSession).toHaveBeenCalledWith(team.id, session.id);
  });

  it.each(['missing', 'foreign'])
    ('returns the same 404 for a %s session', async (kind) => {
      const team = await detailRepos.team.create({ name: 'Authorized Detail Team' });
      const member = await detailRepos.teamMember.create({ teamId: team.id, name: 'Member' });
      const token = await createDetailSession(member.id);
      const sessionId = kind === 'foreign'
        ? (await detailRepos.session.create({ teamId: 'other-team', status: 'open' })).id
        : 'missing-session';

      const response = await GET(
        new NextRequest(`http://localhost/api/teams/${team.id}/sessions/${sessionId}`, {
          headers: { cookie: `session=${token}` },
        }),
        routeContext(team.id, sessionId),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
      expect(getSession).toHaveBeenCalledWith(team.id, sessionId);
    });
});

describe('PATCH /api/teams/[teamId]/sessions/[sessionId]', () => {
  it('returns 401 when no session cookie is present', async () => {
    const team = await repos.team.create({ name: 'Close Unauthenticated Team' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await PATCH(
      patchRequest(team.id, session.id),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the session cookie is invalid', async () => {
    const team = await repos.team.create({ name: 'Close Invalid Cookie Team' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await PATCH(
      patchRequest(team.id, session.id, 'invalid-token'),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the session cookie is expired', async () => {
    const team = await repos.team.create({ name: 'Close Expired Cookie Team' });
    const member = await createDeliveryManager(team.id, 'expired-close@example.com');
    const token = await createUserSession(member.id, new Date(Date.now() - 1_000));
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await PATCH(
      patchRequest(team.id, session.id, token),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when the authenticated member lacks the delivery_manager role', async () => {
    const team = await repos.team.create({ name: 'Close No DM Team' });
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Regular',
      email: 'regular-close@example.com',
    });
    const token = await createUserSession(member.id);
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await PATCH(
      patchRequest(team.id, session.id, token),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when the authenticated member belongs to another team', async () => {
    const requestedTeam = await repos.team.create({ name: 'Requested Close Team' });
    const memberTeam = await repos.team.create({ name: 'Other Member Team' });
    const member = await createDeliveryManager(memberTeam.id, 'other-team-close@example.com');
    const token = await createUserSession(member.id);
    const session = await repos.session.create({ teamId: requestedTeam.id, status: 'open' });

    const response = await PATCH(
      patchRequest(requestedTeam.id, session.id, token),
      routeContext(requestedTeam.id, session.id),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
  });

  it('closes an open session when called by a delivery_manager', async () => {
    const team = await repos.team.create({ name: 'Close Team' });
    const member = await createDeliveryManager(team.id, 'dm-close@example.com');
    const token = await createUserSession(member.id);
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const response = await PATCH(
      patchRequest(team.id, session.id, token),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: true });
    expect(await repos.session.findById(session.id)).toMatchObject({ status: 'closed' });
  });

  it('returns 409 when the session is already closed', async () => {
    const team = await repos.team.create({ name: 'Already Closed Team' });
    const member = await createDeliveryManager(team.id, 'already-closed@example.com');
    const token = await createUserSession(member.id);
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const response = await PATCH(
      patchRequest(team.id, session.id, token),
      routeContext(team.id, session.id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('CONFLICT');
  });

  it('returns 404 when the session does not exist', async () => {
    const team = await repos.team.create({ name: 'No Session Team' });
    const member = await createDeliveryManager(team.id, 'no-session-close@example.com');
    const token = await createUserSession(member.id);

    const response = await PATCH(
      patchRequest(team.id, 'non-existent', token),
      routeContext(team.id, 'non-existent'),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('does not close a session belonging to a different team', async () => {
    const authorizedTeam = await repos.team.create({ name: 'Authorized Close Team' });
    const sessionTeam = await repos.team.create({ name: 'Protected Session Team' });
    const member = await createDeliveryManager(authorizedTeam.id, 'cross-team-close@example.com');
    const token = await createUserSession(member.id);
    const session = await repos.session.create({ teamId: sessionTeam.id, status: 'open' });

    const response = await PATCH(
      patchRequest(authorizedTeam.id, session.id, token),
      routeContext(authorizedTeam.id, session.id),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
    expect(await repos.session.findById(session.id)).toMatchObject({ status: 'open' });
  });
});
