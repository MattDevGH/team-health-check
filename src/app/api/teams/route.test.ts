import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createContainer } from '@/lib/container';
import type { Container } from '@/lib/container';
import {
  createInMemoryRepositories,
  type Repositories,
} from '@/lib/repositories';

import { createTeamRouteHandlers } from './route-handlers';

let repos: Repositories;
let container: Container;
let GET: ReturnType<typeof createTeamRouteHandlers>['GET'];
let POST: ReturnType<typeof createTeamRouteHandlers>['POST'];

beforeEach(() => {
  repos = createInMemoryRepositories();
  container = createContainer(repos);
  ({ GET, POST } = createTeamRouteHandlers({
    getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
    teamService: container.team,
  }));
});

async function createSession(
  memberId = crypto.randomUUID(),
  expired = false,
): Promise<string> {
  const token = `session-${crypto.randomUUID()}`;
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)),
  });
  return token;
}

function request(method: 'GET' | 'POST', token?: string, body?: string): NextRequest {
  return new NextRequest('http://localhost/api/teams', {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { cookie: `session=${token}` } : {}),
    },
    body,
  });
}

describe('GET /api/teams', () => {
  it.each([
    ['missing', undefined],
    ['unknown', 'unknown-token'],
    ['expired', 'expired-token'],
  ])('returns 401 for a %s session', async (kind, suppliedToken) => {
    const token = kind === 'expired'
      ? await createSession(crypto.randomUUID(), true)
      : suppliedToken;

    const response = await GET(request('GET', token));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns only the authenticated member team', async () => {
    const memberId = crypto.randomUUID();
    const ownTeam = await container.team.create('Own Team', undefined, memberId);
    const foreignTeam = await container.team.create(
      'Foreign Team',
      undefined,
      crypto.randomUUID(),
    );
    const token = await createSession(memberId);

    const response = await GET(request('GET', token));
    const body: Array<{ id: string; name: string }> = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([expect.objectContaining({ id: ownTeam.id, name: 'Own Team' })]);
    expect(body.some(({ id }) => id === foreignTeam.id)).toBe(false);
  });

  it('returns an empty list for an authenticated identity without membership', async () => {
    const token = await createSession();

    const response = await GET(request('GET', token));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});

describe('POST /api/teams', () => {
  it('returns 401 before reading an unauthenticated body', async () => {
    const response = await POST(request('POST', undefined, 'not json'));

    expect(response.status).toBe(401);
    await expect(repos.team.list()).resolves.toEqual([]);
  });

  it('derives creator membership, role, and audit identity from the cookie', async () => {
    const memberId = crypto.randomUUID();
    const token = await createSession(memberId);
    const createRequest = request(
      'POST',
      token,
      JSON.stringify({
        name: 'Authenticated Team',
        description: 'Created safely',
        creatorId: 'body-attacker',
      }),
    );
    createRequest.headers.set('x-user-id', 'header-attacker');

    const response = await POST(createRequest);
    const team: { id: string } = await response.json();

    expect(response.status).toBe(201);
    await expect(repos.teamMember.findById(memberId)).resolves.toMatchObject({
      id: memberId,
      teamId: team.id,
    });
    await expect(
      repos.teamMemberRole.findByMemberAndTeam(memberId, team.id),
    ).resolves.toEqual([expect.objectContaining({ role: 'delivery_manager' })]);
    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([
      expect.objectContaining({ changeType: 'team_created', userId: memberId }),
    ]);
  });

  it('returns 409 without creating an orphan team for an existing member', async () => {
    const memberId = crypto.randomUUID();
    const existing = await container.team.create('Existing Team', undefined, memberId);
    const token = await createSession(memberId);

    const response = await POST(
      request('POST', token, JSON.stringify({ name: 'Second Team' })),
    );

    expect(response.status).toBe(409);
    await expect(repos.team.list()).resolves.toHaveLength(1);
    await expect(repos.teamMember.findById(memberId)).resolves.toMatchObject({
      teamId: existing.id,
    });
  });

  it('atomically creates one complete graph for concurrent requests by one member', async () => {
    const memberId = crypto.randomUUID();
    const token = await createSession(memberId);

    const responses = await Promise.all([
      POST(request('POST', token, JSON.stringify({ name: 'First Team' }))),
      POST(request('POST', token, JSON.stringify({ name: 'Second Team' }))),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const conflictResponse = responses.find(({ status }) => status === 409);
    await expect(conflictResponse?.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT' },
    });

    const teams = await repos.team.list();
    expect(teams).toHaveLength(1);
    const [team] = teams;
    await expect(repos.teamMember.findById(memberId)).resolves.toMatchObject({
      teamId: team.id,
    });
    await expect(
      repos.teamMemberRole.findByMemberAndTeam(memberId, team.id),
    ).resolves.toEqual([expect.objectContaining({ role: 'delivery_manager' })]);
    await expect(repos.auditLog.findByTeamId(team.id)).resolves.toEqual([
      expect.objectContaining({ changeType: 'team_created', userId: memberId }),
    ]);
  });

  it.each([
    ['empty name', { name: '' }],
    ['long description', { name: 'Valid Team', description: 'x'.repeat(501) }],
  ])('returns 400 for %s with valid authentication', async (_case, body) => {
    const token = await createSession();

    const response = await POST(request('POST', token, JSON.stringify(body)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('retains the generic error contract for authenticated malformed JSON', async () => {
    const token = await createSession();

    const response = await POST(request('POST', token, 'not json'));

    expect(response.status).toBe(500);
  });
});
