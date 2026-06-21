import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createSessionService, type SessionService } from '@/lib/services/session.service';
import { NotFoundError, ConflictError } from '@/lib/errors';

describe('SessionService.open', () => {
  let repos: Repositories;
  let sessionService: ReturnType<typeof createSessionService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    // Seed team members for link generation
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Bob', email: 'bob@example.com' });
  });

  it('creates a session with status "open" for the given team', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    expect(session).toBeDefined();
    expect(session.teamId).toBe('team-1');
    expect(session.status).toBe('open');
    expect(session.id).toBeTruthy();
  });

  it('generates session links for all team members', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    const members = await repos.teamMember.findByTeamId('team-1');
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link).not.toBeNull();
      expect(link!.token.length).toBeGreaterThanOrEqual(32);
      expect(link!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('sets session link expiry to 7 days from now', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    const members = await repos.teamMember.findByTeamId('team-1');
    const link = await repos.sessionLink.findByMemberAndSession(members[0].id, session.id);

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expectedExpiry = Date.now() + sevenDaysMs;
    // Allow 5 second tolerance for test execution time
    expect(link!.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 5000);
    expect(link!.expiresAt.getTime()).toBeLessThan(expectedExpiry + 5000);
  });

  it('closes existing open session before opening a new one', async () => {
    const first = await sessionService.open('team-1', 'user-1');
    const second = await sessionService.open('team-1', 'user-1');

    const firstUpdated = await repos.session.findById(first.id);
    expect(firstUpdated!.status).toBe('closed');
    expect(firstUpdated!.actualCloseAt).not.toBeNull();

    expect(second.status).toBe('open');
    expect(second.id).not.toBe(first.id);
  });

  it('generates unique tokens for each session link', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    const members = await repos.teamMember.findByTeamId('team-1');
    const tokens: string[] = [];
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      tokens.push(link!.token);
    }

    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(tokens.length);
  });
});


describe('SessionService.close', () => {
  let repos: Repositories;
  let sessionService: ReturnType<typeof createSessionService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
  });

  it('sets status to "closed" and records actualCloseAt on an open session', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    await sessionService.close(session.id, 'user-1');

    const updated = await repos.session.findById(session.id);
    expect(updated!.status).toBe('closed');
    expect(updated!.actualCloseAt).toBeInstanceOf(Date);
    expect(updated!.actualCloseAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('throws ConflictError when closing an already-closed session', async () => {
    const session = await sessionService.open('team-1', 'user-1');

    await sessionService.close(session.id, 'user-1');

    await expect(sessionService.close(session.id, 'user-1')).rejects.toThrow(ConflictError);
    await expect(sessionService.close(session.id, 'user-1')).rejects.toThrow(
      /already closed/i
    );
  });

  it('throws NotFoundError when closing a non-existent session', async () => {
    await expect(sessionService.close('non-existent-id', 'user-1')).rejects.toThrow(NotFoundError);
  });
});


describe('SessionService.generateSessionLinks', () => {
  let repos: Repositories;
  let sessionService: SessionService;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });
  });

  it('generates exactly N links for N team members', async () => {
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Bob', email: 'bob@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Charlie', email: 'charlie@example.com' });

    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await sessionService.generateSessionLinks(session.id);

    const members = await repos.teamMember.findByTeamId('team-1');
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link).not.toBeNull();
    }
    // Verify exactly 3 links created
    let linkCount = 0;
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      if (link) linkCount++;
    }
    expect(linkCount).toBe(3);
  });

  it('generates tokens that are at least 32 characters long', async () => {
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Bob', email: 'bob@example.com' });

    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await sessionService.generateSessionLinks(session.id);

    const members = await repos.teamMember.findByTeamId('team-1');
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link!.token.length).toBeGreaterThanOrEqual(32);
    }
  });

  it('generates unique tokens for all members', async () => {
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Bob', email: 'bob@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Charlie', email: 'charlie@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Diana', email: 'diana@example.com' });

    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await sessionService.generateSessionLinks(session.id);

    const members = await repos.teamMember.findByTeamId('team-1');
    const tokens: string[] = [];
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      tokens.push(link!.token);
    }

    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(tokens.length);
  });

  it('correctly references the session and members in each link', async () => {
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });
    await repos.teamMember.create({ teamId: 'team-1', name: 'Bob', email: 'bob@example.com' });

    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await sessionService.generateSessionLinks(session.id);

    const members = await repos.teamMember.findByTeamId('team-1');
    for (const member of members) {
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link!.sessionId).toBe(session.id);
      expect(link!.memberId).toBe(member.id);
    }
  });

  it('sets expiry to 7 days from now for an open session', async () => {
    await repos.teamMember.create({ teamId: 'team-1', name: 'Alice', email: 'alice@example.com' });

    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await sessionService.generateSessionLinks(session.id);

    const members = await repos.teamMember.findByTeamId('team-1');
    const link = await repos.sessionLink.findByMemberAndSession(members[0].id, session.id);

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expectedExpiry = Date.now() + sevenDaysMs;
    // Allow 5 second tolerance
    expect(link!.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 5000);
    expect(link!.expiresAt.getTime()).toBeLessThan(expectedExpiry + 5000);
  });

  it('throws NotFoundError for a non-existent session', async () => {
    await expect(sessionService.generateSessionLinks('non-existent')).rejects.toThrow(NotFoundError);
  });
});


describe('SessionService.materializeAggregates', () => {
  let repos: Repositories;
  let sessionService: SessionService;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });
  });

  it('materialises correct averages for known scores', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'closed' });

    // Scores: 3, 4, 5 → average = 4.0
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q1', score: 3 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q1', score: 4 });
    await repos.response.upsert({ memberId: 'm3', sessionId: session.id, questionId: 'q1', score: 5 });

    // Scores: 2, 3 → average = 2.5
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q2', score: 2 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q2', score: 3 });

    await sessionService.materializeAggregates(session.id);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    const q1Agg = aggregates.find(a => a.questionId === 'q1');
    const q2Agg = aggregates.find(a => a.questionId === 'q2');

    expect(q1Agg!.averageScore).toBe(4.0);
    expect(q2Agg!.averageScore).toBe(2.5);
  });

  it('produces correct response counts per question', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'closed' });

    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q1', score: 4 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q1', score: 3 });
    await repos.response.upsert({ memberId: 'm3', sessionId: session.id, questionId: 'q1', score: 5 });

    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q2', score: 2 });

    await sessionService.materializeAggregates(session.id);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    const q1Agg = aggregates.find(a => a.questionId === 'q1');
    const q2Agg = aggregates.find(a => a.questionId === 'q2');

    expect(q1Agg!.responseCount).toBe(3);
    expect(q2Agg!.responseCount).toBe(1);
  });

  it('produces correct trend indicator distribution counts', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'closed' });

    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q1', score: 4, trendIndicator: 'improving' });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q1', score: 3, trendIndicator: 'improving' });
    await repos.response.upsert({ memberId: 'm3', sessionId: session.id, questionId: 'q1', score: 5, trendIndicator: 'stable' });
    await repos.response.upsert({ memberId: 'm4', sessionId: session.id, questionId: 'q1', score: 2, trendIndicator: 'declining' });
    await repos.response.upsert({ memberId: 'm5', sessionId: session.id, questionId: 'q1', score: 4 }); // no trend indicator

    await sessionService.materializeAggregates(session.id);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    const q1Agg = aggregates.find(a => a.questionId === 'q1');

    expect(q1Agg!.improvingCount).toBe(2);
    expect(q1Agg!.stableCount).toBe(1);
    expect(q1Agg!.decliningCount).toBe(1);
  });

  it('skips questions with zero responses (no aggregate created)', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'closed' });

    // Only q1 has responses
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q1', score: 4 });

    await sessionService.materializeAggregates(session.id);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);

    // Only one aggregate for q1, no aggregate for questions without responses
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].questionId).toBe('q1');
  });

  it('throws NotFoundError for a non-existent session', async () => {
    await expect(sessionService.materializeAggregates('non-existent')).rejects.toThrow(NotFoundError);
  });

  it('rounds average to 1 decimal place correctly', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'closed' });

    // Scores: 1, 2, 3 → sum=6, avg=2.0
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q1', score: 1 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q1', score: 2 });
    await repos.response.upsert({ memberId: 'm3', sessionId: session.id, questionId: 'q1', score: 3 });

    // Scores: 3, 4 → sum=7, avg=3.5
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q2', score: 3 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q2', score: 4 });

    // Scores: 1, 1, 2 → sum=4, avg=1.333... → 1.3
    await repos.response.upsert({ memberId: 'm1', sessionId: session.id, questionId: 'q3', score: 1 });
    await repos.response.upsert({ memberId: 'm2', sessionId: session.id, questionId: 'q3', score: 1 });
    await repos.response.upsert({ memberId: 'm3', sessionId: session.id, questionId: 'q3', score: 2 });

    await sessionService.materializeAggregates(session.id);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    const q1Agg = aggregates.find(a => a.questionId === 'q1');
    const q2Agg = aggregates.find(a => a.questionId === 'q2');
    const q3Agg = aggregates.find(a => a.questionId === 'q3');

    expect(q1Agg!.averageScore).toBe(2.0);
    expect(q2Agg!.averageScore).toBe(3.5);
    expect(q3Agg!.averageScore).toBe(1.3);
  });
});
