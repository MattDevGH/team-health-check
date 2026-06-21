import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createTrendService, type TrendDistribution, type SessionAverage } from '@/lib/services/trend.service';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

describe('TrendService.getSessionAverages', () => {
  let repos: Repositories;
  let trendService: ReturnType<typeof createTrendService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    trendService = createTrendService({
      sessionAggregateRepo: repos.sessionAggregate,
      sessionRepo: repos.session,
      teamRepo: repos.team,
    });
  });

  it('returns correct averages from materialised aggregates', async () => {
    const team = await repos.team.create({ name: 'Team A', privacyMode: 'attributed' });

    // Create sessions with known dates
    const session1 = await repos.session.create({ teamId: team.id, status: 'closed' });
    const session2 = await repos.session.create({ teamId: team.id, status: 'closed' });

    // Register session-to-team mappings
    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session1.id, team.id);
    aggregateRepo.registerSessionTeam(session2.id, team.id);

    // Create aggregates
    await repos.sessionAggregate.create({
      sessionId: session1.id,
      questionId: 'q1',
      averageScore: 3.5,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });
    await repos.sessionAggregate.create({
      sessionId: session2.id,
      questionId: 'q1',
      averageScore: 4.2,
      responseCount: 4,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 0,
    });

    const result = await trendService.getSessionAverages(team.id);

    expect(result).toHaveLength(2);
    expect(result[0].averageScore).toBe(3.5);
    expect(result[0].responseCount).toBe(5);
    expect(result[1].averageScore).toBe(4.2);
    expect(result[1].responseCount).toBe(4);
  });

  it('filters by questionId when provided', async () => {
    const team = await repos.team.create({ name: 'Team B', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session.id, team.id);

    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3.0,
      responseCount: 5,
      improvingCount: 1,
      stableCount: 2,
      decliningCount: 2,
    });
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q2',
      averageScore: 4.5,
      responseCount: 5,
      improvingCount: 3,
      stableCount: 1,
      decliningCount: 1,
    });

    const result = await trendService.getSessionAverages(team.id, 'q1');

    expect(result).toHaveLength(1);
    expect(result[0].questionId).toBe('q1');
    expect(result[0].averageScore).toBe(3.0);
  });

  it('omits sessions with zero responses for a question', async () => {
    const team = await repos.team.create({ name: 'Team C', privacyMode: 'attributed' });
    const session1 = await repos.session.create({ teamId: team.id, status: 'closed' });
    const session2 = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session1.id, team.id);
    aggregateRepo.registerSessionTeam(session2.id, team.id);

    await repos.sessionAggregate.create({
      sessionId: session1.id,
      questionId: 'q1',
      averageScore: 3.5,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });
    // Zero responses — should be omitted
    await repos.sessionAggregate.create({
      sessionId: session2.id,
      questionId: 'q1',
      averageScore: 0,
      responseCount: 0,
      improvingCount: 0,
      stableCount: 0,
      decliningCount: 0,
    });

    const result = await trendService.getSessionAverages(team.id);

    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe(session1.id);
  });

  it('suppresses data below threshold (3) in anonymous mode', async () => {
    const team = await repos.team.create({ name: 'Team D', privacyMode: 'anonymous' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session.id, team.id);

    // Only 2 responses — below default threshold of 3
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 4.0,
      responseCount: 2,
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    });

    const result = await trendService.getSessionAverages(team.id);

    expect(result).toHaveLength(1);
    expect(result[0].suppressed).toBe(true);
    // When suppressed, averageScore should not be exposed
    expect(result[0].averageScore).toBeNull();
  });

  it('does NOT suppress in attributed mode', async () => {
    const team = await repos.team.create({ name: 'Team E', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session.id, team.id);

    // Only 2 responses — but mode is attributed, so no suppression
    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 4.0,
      responseCount: 2,
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    });

    const result = await trendService.getSessionAverages(team.id);

    expect(result).toHaveLength(1);
    expect(result[0].suppressed).toBeFalsy();
    expect(result[0].averageScore).toBe(4.0);
  });

  it('returns results in chronological order by session date', async () => {
    vi.useFakeTimers();
    try {
      const team = await repos.team.create({ name: 'Team F', privacyMode: 'attributed' });

      // Create session1 at an earlier time
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const session1 = await repos.session.create({ teamId: team.id, status: 'closed' });

      // Create session2 at a later time
      vi.setSystemTime(new Date('2024-02-15T10:00:00Z'));
      const session2 = await repos.session.create({ teamId: team.id, status: 'closed' });

      const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
      aggregateRepo.registerSessionTeam(session1.id, team.id);
      aggregateRepo.registerSessionTeam(session2.id, team.id);

      // Insert aggregates in reverse order (session2 first) to prove the service sorts
      await repos.sessionAggregate.create({
        sessionId: session2.id,
        questionId: 'q1',
        averageScore: 4.5,
        responseCount: 5,
        improvingCount: 3,
        stableCount: 1,
        decliningCount: 1,
      });
      await repos.sessionAggregate.create({
        sessionId: session1.id,
        questionId: 'q1',
        averageScore: 3.0,
        responseCount: 5,
        improvingCount: 1,
        stableCount: 2,
        decliningCount: 2,
      });

      const result = await trendService.getSessionAverages(team.id);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe(session1.id);
      expect(result[1].sessionId).toBe(session2.id);
      expect(result[0].sessionDate.getTime()).toBeLessThan(result[1].sessionDate.getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('TrendService.getTrendIndicatorDistribution', () => {
  let repos: Repositories;
  let trendService: ReturnType<typeof createTrendService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    trendService = createTrendService({
      sessionAggregateRepo: repos.sessionAggregate,
      sessionRepo: repos.session,
      teamRepo: repos.team,
    });
  });

  it('returns correct distribution counts for a session with known aggregates', async () => {
    const team = await repos.team.create({ name: 'Team A', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session.id, team.id);

    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q1',
      averageScore: 3.5,
      responseCount: 5,
      improvingCount: 2,
      stableCount: 2,
      decliningCount: 1,
    });

    await repos.sessionAggregate.create({
      sessionId: session.id,
      questionId: 'q2',
      averageScore: 4.0,
      responseCount: 4,
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 2,
    });

    const result: TrendDistribution[] = await trendService.getTrendIndicatorDistribution(session.id);

    expect(result).toHaveLength(2);

    const q1 = result.find(d => d.questionId === 'q1');
    expect(q1).toBeDefined();
    expect(q1!.improvingCount).toBe(2);
    expect(q1!.stableCount).toBe(2);
    expect(q1!.decliningCount).toBe(1);

    const q2 = result.find(d => d.questionId === 'q2');
    expect(q2).toBeDefined();
    expect(q2!.improvingCount).toBe(1);
    expect(q2!.stableCount).toBe(1);
    expect(q2!.decliningCount).toBe(2);
  });

  it('returns empty array for non-existent session', async () => {
    const result = await trendService.getTrendIndicatorDistribution('non-existent-session-id');

    expect(result).toEqual([]);
  });

  it('includes all questions that have aggregates', async () => {
    const team = await repos.team.create({ name: 'Team B', privacyMode: 'attributed' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
    aggregateRepo.registerSessionTeam(session.id, team.id);

    // Create aggregates for 5 different questions
    const questionIds = ['q1', 'q2', 'q3', 'q4', 'q5'];
    for (let i = 0; i < questionIds.length; i++) {
      await repos.sessionAggregate.create({
        sessionId: session.id,
        questionId: questionIds[i],
        averageScore: 3.0 + i * 0.3,
        responseCount: 4,
        improvingCount: i,
        stableCount: 4 - i,
        decliningCount: 0,
      });
    }

    const result = await trendService.getTrendIndicatorDistribution(session.id);

    expect(result).toHaveLength(5);

    // Verify all question IDs are present
    const returnedQuestionIds = result.map(d => d.questionId).sort();
    expect(returnedQuestionIds).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);

    // Verify counts match what was stored
    for (let i = 0; i < questionIds.length; i++) {
      const dist = result.find(d => d.questionId === questionIds[i]);
      expect(dist).toBeDefined();
      expect(dist!.improvingCount).toBe(i);
      expect(dist!.stableCount).toBe(4 - i);
      expect(dist!.decliningCount).toBe(0);
    }
  });
});


describe('TrendService.exportCSV', () => {
  let repos: Repositories;
  let trendService: ReturnType<typeof createTrendService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    trendService = createTrendService({
      sessionAggregateRepo: repos.sessionAggregate,
      sessionRepo: repos.session,
      teamRepo: repos.team,
    });
  });

  it('generates CSV with correct header', async () => {
    const team = await repos.team.create({ name: 'CSV Team', privacyMode: 'attributed' });

    const csv = await trendService.exportCSV(team.id);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Session Date,Question,Average Score,Response Count,Improving,Stable,Declining');
  });

  it('includes correct data for known aggregates', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2024-03-01T10:00:00Z'));
      const team = await repos.team.create({ name: 'CSV Team', privacyMode: 'attributed' });
      const session = await repos.session.create({ teamId: team.id, status: 'closed' });

      const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
      aggregateRepo.registerSessionTeam(session.id, team.id);

      await repos.sessionAggregate.create({
        sessionId: session.id,
        questionId: 'q1',
        averageScore: 3.5,
        responseCount: 5,
        improvingCount: 2,
        stableCount: 2,
        decliningCount: 1,
      });

      const csv = await trendService.exportCSV(team.id);
      const lines = csv.split('\n').filter(l => l.length > 0);

      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toBe('2024-03-01T10:00:00.000Z,q1,3.5,5,2,2,1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters by date range — only includes sessions within range', async () => {
    vi.useFakeTimers();
    try {
      const team = await repos.team.create({ name: 'Range Team', privacyMode: 'attributed' });

      // Session 1: January
      vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
      const session1 = await repos.session.create({ teamId: team.id, status: 'closed' });

      // Session 2: March
      vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
      const session2 = await repos.session.create({ teamId: team.id, status: 'closed' });

      // Session 3: May
      vi.setSystemTime(new Date('2024-05-15T10:00:00Z'));
      const session3 = await repos.session.create({ teamId: team.id, status: 'closed' });

      const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
      aggregateRepo.registerSessionTeam(session1.id, team.id);
      aggregateRepo.registerSessionTeam(session2.id, team.id);
      aggregateRepo.registerSessionTeam(session3.id, team.id);

      await repos.sessionAggregate.create({
        sessionId: session1.id,
        questionId: 'q1',
        averageScore: 3.0,
        responseCount: 5,
        improvingCount: 1,
        stableCount: 2,
        decliningCount: 2,
      });
      await repos.sessionAggregate.create({
        sessionId: session2.id,
        questionId: 'q1',
        averageScore: 3.5,
        responseCount: 5,
        improvingCount: 2,
        stableCount: 2,
        decliningCount: 1,
      });
      await repos.sessionAggregate.create({
        sessionId: session3.id,
        questionId: 'q1',
        averageScore: 4.0,
        responseCount: 5,
        improvingCount: 3,
        stableCount: 1,
        decliningCount: 1,
      });

      // Filter: February to April (should only include session2)
      const csv = await trendService.exportCSV(team.id, {
        from: new Date('2024-02-01T00:00:00Z'),
        to: new Date('2024-04-30T23:59:59Z'),
      });
      const lines = csv.split('\n').filter(l => l.length > 0);

      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain('2024-03-15');
      expect(lines[1]).toContain('3.5');
    } finally {
      vi.useRealTimers();
    }
  });

  it('anonymous mode does not include individual member data — only aggregates', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2024-03-01T10:00:00Z'));
      const team = await repos.team.create({ name: 'Anonymous Team', privacyMode: 'anonymous' });
      const session = await repos.session.create({ teamId: team.id, status: 'closed' });

      const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
      aggregateRepo.registerSessionTeam(session.id, team.id);

      await repos.sessionAggregate.create({
        sessionId: session.id,
        questionId: 'q1',
        averageScore: 4.0,
        responseCount: 5,
        improvingCount: 3,
        stableCount: 1,
        decliningCount: 1,
      });

      const csv = await trendService.exportCSV(team.id);
      const lines = csv.split('\n').filter(l => l.length > 0);

      // CSV should only contain aggregate columns — no member names, emails, or individual scores
      expect(lines[0]).toBe('Session Date,Question,Average Score,Response Count,Improving,Stable,Declining');
      expect(lines[1]).not.toContain('member');
      // The data row should have exactly 7 comma-separated values
      expect(lines[1].split(',').length).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows "insufficient data" for suppressed aggregates instead of score', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2024-03-01T10:00:00Z'));
      const team = await repos.team.create({ name: 'Suppressed Team', privacyMode: 'anonymous' });
      const session = await repos.session.create({ teamId: team.id, status: 'closed' });

      const aggregateRepo = repos.sessionAggregate as InMemorySessionAggregateRepository;
      aggregateRepo.registerSessionTeam(session.id, team.id);

      // Only 2 responses — below default anonymity threshold of 3
      await repos.sessionAggregate.create({
        sessionId: session.id,
        questionId: 'q1',
        averageScore: 4.0,
        responseCount: 2,
        improvingCount: 1,
        stableCount: 1,
        decliningCount: 0,
      });

      const csv = await trendService.exportCSV(team.id);
      const lines = csv.split('\n').filter(l => l.length > 0);

      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain('insufficient data');
      // Should not contain the actual average score
      expect(lines[1]).not.toContain('4.0');
    } finally {
      vi.useRealTimers();
    }
  });
});
