/**
 * Tests for GET /api/teams/[teamId]/export
 * Requirements: 8.9, 20.6
 */

import { describe, it, expect } from 'vitest';
import { GET, _testRepos as repos } from './route';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/** Helper to register session-team mapping in the in-memory aggregate repo */
function registerSessionTeam(sessionId: string, teamId: string): void {
  (repos.sessionAggregate as InMemorySessionAggregateRepository).registerSessionTeam(sessionId, teamId);
}

describe('GET /api/teams/[teamId]/export', () => {
  it('returns CSV with correct content-type header', async () => {
    const team = await repos.team.create({ name: 'Export Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/export`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    expect(response.headers.get('Content-Disposition')).toContain('.csv');
  });

  it('returns CSV header even when no data', async () => {
    const team = await repos.team.create({ name: 'Empty Export Team' });
    const request = new Request(`http://localhost/api/teams/${team.id}/export`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    const text = await response.text();
    expect(text).toContain('Session Date,Question,Average Score,Response Count,Improving,Stable,Declining');
  });

  it('exports trend data as CSV rows', async () => {
    const team = await repos.team.create({ name: 'Data Export Team', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 4.0,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/export`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    const text = await response.text();
    const lines = text.split('\n');

    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain('q1');
    expect(lines[1]).toContain('4');
    expect(lines[1]).toContain('5');
  });

  it('shows "insufficient data" in anonymous mode for sub-threshold aggregates', async () => {
    const team = await repos.team.create({ name: 'Anon Export Team', privacyMode: 'anonymous' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(session.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3.0,
      responseCount: 2, // Below anonymity threshold
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    });

    const request = new Request(`http://localhost/api/teams/${team.id}/export`);
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    const text = await response.text();

    expect(text).toContain('insufficient data');
  });

  it('respects date range filter', async () => {
    const team = await repos.team.create({ name: 'Date Range Team', privacyMode: 'attributed' });
    const oldSession = await repos.session.create({ teamId: team.id, status: 'closed' });
    const newSession = await repos.session.create({ teamId: team.id, status: 'closed' });
    registerSessionTeam(oldSession.id, team.id);
    registerSessionTeam(newSession.id, team.id);
    await repos.sessionAggregate.create({
      sessionId: oldSession.id,
      questionId: 'q1',
      averageScore: 3.0,
      responseCount: 5,
      improvingCount: 1,
      stableCount: 2,
      decliningCount: 2,
    });
    await repos.sessionAggregate.create({
      sessionId: newSession.id,
      questionId: 'q1',
      averageScore: 4.5,
      responseCount: 5,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 1,
    });

    // Filter to future date range — should exclude old data
    const futureFrom = new Date(Date.now() + 86400000).toISOString();
    const futureTo = new Date(Date.now() + 172800000).toISOString();
    const request = new Request(
      `http://localhost/api/teams/${team.id}/export?from=${futureFrom}&to=${futureTo}`
    );
    const context = { params: Promise.resolve({ teamId: team.id }) };

    const response = await GET(request, context);
    const text = await response.text();
    const lines = text.split('\n');

    // Only header row, no data in the future date range
    expect(lines).toHaveLength(1);
  });
});
