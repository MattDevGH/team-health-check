/**
 * Tests for GET /api/teams/[teamId]/trends
 * Requirements: 8.1, 20.6
 */

import { describe, it, expect } from 'vitest';
import { GET, _testRepos as repos } from './route';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/** Helper to register session-team mapping in the in-memory aggregate repo */
function registerSessionTeam(sessionId: string, teamId: string): void {
  (repos.sessionAggregate as InMemorySessionAggregateRepository).registerSessionTeam(sessionId, teamId);
}

describe('GET /api/teams/[teamId]/trends', () => {
  it('returns empty data array when no aggregates exist', async () => {
    const team = await repos.team.create({ name: 'Empty Trends Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/trends`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.teamId).toBe(team.id);
    expect(body.privacyMode).toBe('anonymous');
    expect(body.data).toEqual([]);
  });

  it('returns session averages with privacy mode metadata', async () => {
    const team = await repos.team.create({ name: 'Trends Team', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 4.2,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/trends`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.privacyMode).toBe('attributed');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].questionId).toBe('q1');
    expect(body.data[0].averageScore).toBe(4.2);
    expect(body.data[0].responseCount).toBe(5);
  });

  it('filters by questionId query param', async () => {
    const team = await repos.team.create({ name: 'Filter Team' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3.5,
      responseCount: 4,
      improvingCount: 1,
      stableCount: 2,
      decliningCount: 1,
    });
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q2',
      averageScore: 4.0,
      responseCount: 4,
      improvingCount: 2,
      stableCount: 1,
      decliningCount: 1,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/trends?questionId=q1`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].questionId).toBe('q1');
  });

  it('suppresses data below anonymity threshold in anonymous mode', async () => {
    const team = await repos.team.create({ name: 'Anon Team', privacyMode: 'anonymous' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3.0,
      responseCount: 2, // Below default threshold of 3
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/trends`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].averageScore).toBeNull();
    expect(body.data[0].suppressed).toBe(true);
  });
});
