/**
 * GET /api/teams/[teamId]/export
 * Requirements: Integration 2.1, 2.6, 9.1-9.3; Original 8.9, 20.6.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthorizeTeamMember } from '@/lib/auth/authorize-team-member';
import { createGetAuthContext } from '@/lib/auth/with-auth';
import { createContainer, type Container } from '@/lib/container';
import {
  createInMemoryRepositories,
  type Repositories,
} from '@/lib/repositories';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

import { createTeamExportRouteHandler } from './route-handlers';

type DateRange = { from: Date; to: Date };
type ExportCSV = (teamId: string, dateRange?: DateRange) => Promise<string>;
type AuthorizeTeamMember = (memberId: string, teamId: string) => Promise<void>;

let repos: Repositories;
let container: Container;
let GET: ReturnType<typeof createTeamExportRouteHandler>;
let exportCSV: ExportCSV;
let authorizeTeamMember: AuthorizeTeamMember;

beforeEach(() => {
  repos = createInMemoryRepositories();
  container = createContainer(repos);
  exportCSV = vi.fn((teamId, dateRange) => container.trend.exportCSV(teamId, dateRange));
  authorizeTeamMember = vi.fn(
    createAuthorizeTeamMember({ teamMemberRepo: repos.teamMember }),
  );
  GET = createTeamExportRouteHandler({
    getAuthContext: createGetAuthContext({ userSessionRepo: repos.userSession }),
    authorizeTeamMember,
    exportCSV,
  });
});

function registerSessionTeam(sessionId: string, teamId: string): void {
  (repos.sessionAggregate as InMemorySessionAggregateRepository)
    .registerSessionTeam(sessionId, teamId);
}

async function createSession(memberId: string, expired = false): Promise<string> {
  const token = `export-session-${crypto.randomUUID()}`;
  await repos.userSession.create({
    memberId,
    token,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)),
  });
  return token;
}

async function createAuthenticatedTeam(
  privacyMode: 'anonymous' | 'attributed' = 'anonymous',
) {
  const team = await repos.team.create({ name: 'Export Team', privacyMode });
  const memberId = crypto.randomUUID();
  await repos.teamMember.create({
    id: memberId,
    teamId: team.id,
    name: 'Authenticated Member',
  });
  return { team, memberId, token: await createSession(memberId) };
}

function exportRequest(teamId: string, token?: string, query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/teams/${teamId}/export${query}`, {
    headers: token ? { cookie: `session=${token}` } : undefined,
  });
}

function context(teamId: string) {
  return { params: Promise.resolve({ teamId }) };
}

describe('GET /api/teams/[teamId]/export authorization', () => {
  it.each([
    ['missing', undefined],
    ['unknown', 'unknown-export-token'],
    ['expired', 'expired-export-token'],
  ])('returns generic 401 for a %s session before export work', async (kind, suppliedToken) => {
    const teamId = crypto.randomUUID();
    const token = kind === 'expired'
      ? await createSession(crypto.randomUUID(), true)
      : suppliedToken;

    const response = await GET(exportRequest(teamId, token), context(teamId));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    expect(authorizeTeamMember).not.toHaveBeenCalled();
    expect(exportCSV).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'nonexistent'])
    ('returns the same 403 without export work for a %s team', async (targetKind) => {
      const { memberId, token } = await createAuthenticatedTeam();
      const targetTeamId = targetKind === 'foreign'
        ? (await repos.team.create({ name: 'Foreign Team' })).id
        : crypto.randomUUID();

      const response = await GET(
        exportRequest(targetTeamId, token),
        context(targetTeamId),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this team' },
      });
      expect(authorizeTeamMember).toHaveBeenCalledWith(memberId, targetTeamId);
      expect(exportCSV).not.toHaveBeenCalled();
    });
});

describe('GET /api/teams/[teamId]/export CSV contract', () => {
  it('returns the requested team CSV with download headers', async () => {
    const { team, memberId, token } = await createAuthenticatedTeam();

    const response = await GET(exportRequest(team.id, token), context(team.id));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="team-${team.id}-trends.csv"`,
    );
    expect(authorizeTeamMember).toHaveBeenCalledWith(memberId, team.id);
    expect(exportCSV).toHaveBeenCalledWith(team.id, undefined);
  });

  it('returns the CSV header when the team has no trend data', async () => {
    const { team, token } = await createAuthenticatedTeam();

    const response = await GET(exportRequest(team.id, token), context(team.id));

    await expect(response.text()).resolves.toBe(
      'Session Date,Question,Average Score,Response Count,Improving,Stable,Declining',
    );
  });

  it('exports aggregate trend rows for the requested team', async () => {
    const { team, token } = await createAuthenticatedTeam('attributed');
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 4,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    const response = await GET(exportRequest(team.id, token), context(team.id));
    const lines = (await response.text()).split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('q1,4,5,2,2,1');
  });

  it('preserves anonymous sub-threshold score suppression', async () => {
    const { team, token } = await createAuthenticatedTeam('anonymous');
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3,
      responseCount: 2,
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    });

    const response = await GET(exportRequest(team.id, token), context(team.id));

    await expect(response.text()).resolves.toContain('insufficient data');
  });

  it('forwards a complete optional date range for the requested team', async () => {
    const { team, token } = await createAuthenticatedTeam('attributed');
    const from = new Date(Date.now() + 86_400_000);
    const to = new Date(Date.now() + 172_800_000);
    const query = `?from=${from.toISOString()}&to=${to.toISOString()}`;

    const response = await GET(exportRequest(team.id, token, query), context(team.id));

    expect(response.status).toBe(200);
    expect(exportCSV).toHaveBeenCalledWith(team.id, { from, to });
  });
});
