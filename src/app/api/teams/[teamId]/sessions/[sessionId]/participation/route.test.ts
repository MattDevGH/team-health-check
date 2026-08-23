import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createContainer, type Container } from '@/lib/container';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createParticipationRouteHandler } from './route-handlers';

function makeContext(teamId: string, sessionId: string) {
  return { params: Promise.resolve({ teamId, sessionId }) };
}

function makeRequest(teamId: string, sessionId: string, token?: string, spoofedId?: string) {
  const headers = new Headers();
  if (token) headers.set('cookie', `session=${token}`);
  if (spoofedId) headers.set('x-user-id', spoofedId);
  return new NextRequest(
    `http://localhost/api/teams/${teamId}/sessions/${sessionId}/participation`,
    { headers },
  );
}

describe('GET /api/teams/[teamId]/sessions/[sessionId]/participation', () => {
  let repos: Repositories;
  let container: Container;
  let GET: ReturnType<typeof createParticipationRouteHandler>;
  let authorizeTeamMember: ReturnType<typeof createAuthorizeTeamMember>;
  let getParticipation: Container['participation']['get'];

  beforeEach(() => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);
    authorizeTeamMember = vi.fn(
      createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember }),
    );
    getParticipation = vi.fn((teamId, sessionId, memberId) =>
      container.participation.get(teamId, sessionId, memberId));
    GET = createParticipationRouteHandler({
      getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
      authorizeTeamMember,
      getParticipation,
    });
  });

  async function createUserSession(
    memberId: string,
    expiresAt = new Date(Date.now() + 60_000),
  ): Promise<string> {
    const token = `participation-${memberId}-${Date.now()}-${Math.random()}`;
    await repos.userSession.create({ memberId, token, expiresAt });
    return token;
  }

  it.each([
    ['missing', undefined],
    ['unknown', 'unknown-participation-token'],
    ['expired', 'expired-participation-token'],
  ])('returns generic 401 for a %s session cookie', async (kind, suppliedToken) => {
    const team = await repos.team.create({ name: `Participation ${kind} Auth Team` });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Member' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    const token = kind === 'expired'
      ? await createUserSession(member.id, new Date(Date.now() - 1_000))
      : suppliedToken;
    const paramsAccess = vi.fn();
    const context = {
      get params() {
        paramsAccess();
        return Promise.resolve({ teamId: team.id, sessionId: session.id });
      },
    };

    const response = await GET(makeRequest(team.id, session.id, token), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    expect(paramsAccess).not.toHaveBeenCalled();
    expect(authorizeTeamMember).not.toHaveBeenCalled();
    expect(getParticipation).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'nonexistent'])
    ('returns the same 403 for a %s requested team and ignores x-user-id', async (kind) => {
      const memberTeam = await repos.team.create({ name: 'Participation Member Team' });
      const member = await repos.teamMember.create({ teamId: memberTeam.id, name: 'Cookie Member' });
      const token = await createUserSession(member.id);
      const requestedTeamId = kind === 'foreign'
        ? (await repos.team.create({ name: 'Participation Requested Team' })).id
        : 'nonexistent-participation-team';
      const spoofedMember = kind === 'foreign'
        ? await repos.teamMember.create({ teamId: requestedTeamId, name: 'Spoofed Member' })
        : member;

      const response = await GET(
        makeRequest(requestedTeamId, 'missing-session', token, spoofedMember.id),
        makeContext(requestedTeamId, 'missing-session'),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this team' },
      });
      expect(authorizeTeamMember).toHaveBeenCalledWith(member.id, requestedTeamId);
      expect(getParticipation).not.toHaveBeenCalled();
    });

  it('returns participation data for an ordinary same-team member', async () => {
    const team = await repos.team.create({ name: 'Participation Team', privacyMode: 'attributed' });
    const requester = await repos.teamMember.create({ teamId: team.id, name: 'Alice' });
    const nonResponder = await repos.teamMember.create({ teamId: team.id, name: 'Bob' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    const token = await createUserSession(requester.id);
    await repos.response.upsert({
      memberId: requester.id,
      sessionId: session.id,
      questionId: 'q1',
      score: 4,
      trendIndicator: 'improving',
    });

    const response = await GET(
      makeRequest(team.id, session.id, token, nonResponder.id),
      makeContext(team.id, session.id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalCount: 2,
      respondedCount: 1,
      nonResponders: [{ id: nonResponder.id, name: 'Bob' }],
    });
    expect(getParticipation).toHaveBeenCalledWith(team.id, session.id, requester.id);
  });

  it.each(['missing', 'foreign'])
    ('returns the same 404 for a %s session', async (kind) => {
      const team = await repos.team.create({ name: 'Participation Authorized Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Member' });
      const token = await createUserSession(member.id);
      const sessionId = kind === 'foreign'
        ? (await repos.session.create({ teamId: 'other-team', status: 'open' })).id
        : 'missing-session';

      const response = await GET(
        makeRequest(team.id, sessionId, token),
        makeContext(team.id, sessionId),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
      expect(getParticipation).toHaveBeenCalledWith(team.id, sessionId, member.id);
    });
});
