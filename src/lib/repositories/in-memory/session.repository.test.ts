/**
 * Unit tests for in-memory SessionRepository and ResponseRepository fakes.
 * Requirements: 3.2, 10.2, 10.3
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { InMemorySessionRepository } from './session.repository';
import { InMemoryResponseRepository } from './response.repository';
import type { SessionRepository, ResponseRepository } from '../types';

describe('InMemorySessionRepository', () => {
  let repo: SessionRepository;

  beforeEach(() => {
    repo = new InMemorySessionRepository();
  });

  it('creates a session with generated id and timestamps', async () => {
    const session = await repo.create({ teamId: 'team-1', status: 'open' });

    expect(session.id).toBeDefined();
    expect(session.teamId).toBe('team-1');
    expect(session.status).toBe('open');
    expect(session.actualOpenAt).toBeInstanceOf(Date);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.scheduledOpenAt).toBeNull();
    expect(session.scheduledCloseAt).toBeNull();
    expect(session.actualCloseAt).toBeNull();
  });

  it('creates a session with optional scheduled dates', async () => {
    const openAt = new Date('2024-01-15T09:00:00Z');
    const closeAt = new Date('2024-01-17T17:00:00Z');

    const session = await repo.create({
      teamId: 'team-1',
      status: 'open',
      scheduledOpenAt: openAt,
      scheduledCloseAt: closeAt,
    });

    expect(session.scheduledOpenAt).toEqual(openAt);
    expect(session.scheduledCloseAt).toEqual(closeAt);
  });

  it('finds a session by id', async () => {
    const created = await repo.create({ teamId: 'team-1', status: 'open' });
    const found = await repo.findById(created.id);

    expect(found).toEqual(created);
  });

  it('returns null for non-existent id', async () => {
    const found = await repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('finds an open session by team id', async () => {
    await repo.create({ teamId: 'team-1', status: 'closed' });
    const open = await repo.create({ teamId: 'team-1', status: 'open' });

    const found = await repo.findOpenByTeamId('team-1');
    expect(found).toEqual(open);
  });

  it('returns null when no open session exists for team', async () => {
    await repo.create({ teamId: 'team-1', status: 'closed' });
    const found = await repo.findOpenByTeamId('team-1');
    expect(found).toBeNull();
  });

  it('finds all sessions by team id', async () => {
    await repo.create({ teamId: 'team-1', status: 'open' });
    await repo.create({ teamId: 'team-1', status: 'closed' });
    await repo.create({ teamId: 'team-2', status: 'open' });

    const sessions = await repo.findByTeamId('team-1');
    expect(sessions).toHaveLength(2);
    expect(sessions.every(s => s.teamId === 'team-1')).toBe(true);
  });

  it('updates session status', async () => {
    const created = await repo.create({ teamId: 'team-1', status: 'open' });
    const updated = await repo.update(created.id, { status: 'closed' });

    expect(updated.status).toBe('closed');
    expect(updated.id).toBe(created.id);
  });

  it('updates session actualCloseAt', async () => {
    const created = await repo.create({ teamId: 'team-1', status: 'open' });
    const closeTime = new Date('2024-01-17T17:00:00Z');
    const updated = await repo.update(created.id, { actualCloseAt: closeTime });

    expect(updated.actualCloseAt).toEqual(closeTime);
  });

  it('throws when updating non-existent session', async () => {
    await expect(repo.update('non-existent', { status: 'closed' }))
      .rejects.toThrow();
  });
});

describe('InMemoryResponseRepository', () => {
  let responseRepo: ResponseRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(() => {
    sessionRepo = new InMemorySessionRepository();
    responseRepo = new InMemoryResponseRepository((sessionId: string) => {
      const sessions = (sessionRepo as InMemorySessionRepository).getAll();
      const session = sessions.find(s => s.id === sessionId);
      return session?.teamId ?? null;
    });
  });

  describe('upsert', () => {
    it('creates a new response when none exists', async () => {
      const response = await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 4,
      });

      expect(response.id).toBeDefined();
      expect(response.memberId).toBe('member-1');
      expect(response.sessionId).toBe('session-1');
      expect(response.questionId).toBe('q-1');
      expect(response.score).toBe(4);
      expect(response.trendIndicator).toBeNull();
      expect(response.submittedAt).toBeInstanceOf(Date);
      expect(response.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a response with trend indicator', async () => {
      const response = await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 3,
        trendIndicator: 'improving',
      });

      expect(response.trendIndicator).toBe('improving');
    });

    it('updates existing response on same (memberId, sessionId, questionId)', async () => {
      const first = await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 3,
      });

      const second = await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 5,
        trendIndicator: 'declining',
      });

      expect(second.id).toBe(first.id);
      expect(second.score).toBe(5);
      expect(second.trendIndicator).toBe('declining');
      expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    });

    it('upsert is idempotent - same data produces same result', async () => {
      await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 4,
        trendIndicator: 'stable',
      });

      await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 4,
        trendIndicator: 'stable',
      });

      const results = await responseRepo.findByMemberAndSession('member-1', 'session-1');
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(4);
    });

    it('different questions create separate responses', async () => {
      await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-1',
        score: 3,
      });

      await responseRepo.upsert({
        memberId: 'member-1',
        sessionId: 'session-1',
        questionId: 'q-2',
        score: 5,
      });

      const results = await responseRepo.findByMemberAndSession('member-1', 'session-1');
      expect(results).toHaveLength(2);
    });
  });

  describe('findByMemberAndSession', () => {
    it('returns all responses for a member in a session', async () => {
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 'session-1', questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 'session-1', questionId: 'q-2', score: 4 });
      await responseRepo.upsert({ memberId: 'member-2', sessionId: 'session-1', questionId: 'q-1', score: 5 });

      const results = await responseRepo.findByMemberAndSession('member-1', 'session-1');
      expect(results).toHaveLength(2);
      expect(results.every(r => r.memberId === 'member-1')).toBe(true);
    });

    it('returns empty array when no responses exist', async () => {
      const results = await responseRepo.findByMemberAndSession('member-1', 'session-1');
      expect(results).toEqual([]);
    });
  });

  describe('findBySession', () => {
    it('returns all responses for a session', async () => {
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 'session-1', questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'member-2', sessionId: 'session-1', questionId: 'q-1', score: 4 });
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 'session-2', questionId: 'q-1', score: 5 });

      const results = await responseRepo.findBySession('session-1');
      expect(results).toHaveLength(2);
      expect(results.every(r => r.sessionId === 'session-1')).toBe(true);
    });
  });

  describe('findRecentByTeamAndQuestion', () => {
    it('returns responses for a team and question ordered by submittedAt desc', async () => {
      // Set up sessions belonging to a team
      const s1 = await sessionRepo.create({ teamId: 'team-1', status: 'closed' });
      const s2 = await sessionRepo.create({ teamId: 'team-1', status: 'closed' });
      const s3 = await sessionRepo.create({ teamId: 'team-2', status: 'closed' });

      await responseRepo.upsert({ memberId: 'm-1', sessionId: s1.id, questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'm-2', sessionId: s2.id, questionId: 'q-1', score: 4 });
      await responseRepo.upsert({ memberId: 'm-3', sessionId: s3.id, questionId: 'q-1', score: 5 });

      const results = await responseRepo.findRecentByTeamAndQuestion('team-1', 'q-1', 10);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.questionId === 'q-1')).toBe(true);
      // Should not include team-2 responses
      expect(results.find(r => r.sessionId === s3.id)).toBeUndefined();
    });

    it('limits results to count parameter', async () => {
      const s1 = await sessionRepo.create({ teamId: 'team-1', status: 'closed' });

      await responseRepo.upsert({ memberId: 'm-1', sessionId: s1.id, questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'm-2', sessionId: s1.id, questionId: 'q-1', score: 4 });
      await responseRepo.upsert({ memberId: 'm-3', sessionId: s1.id, questionId: 'q-1', score: 5 });

      const results = await responseRepo.findRecentByTeamAndQuestion('team-1', 'q-1', 2);
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no matching responses', async () => {
      const results = await responseRepo.findRecentByTeamAndQuestion('team-1', 'q-1', 10);
      expect(results).toEqual([]);
    });
  });

  describe('deleteByMemberId', () => {
    it('deletes all responses for a member and returns count', async () => {
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 's-1', questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'member-1', sessionId: 's-1', questionId: 'q-2', score: 4 });
      await responseRepo.upsert({ memberId: 'member-2', sessionId: 's-1', questionId: 'q-1', score: 5 });

      const count = await responseRepo.deleteByMemberId('member-1');

      expect(count).toBe(2);
      const remaining = await responseRepo.findBySession('s-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].memberId).toBe('member-2');
    });

    it('returns 0 when member has no responses', async () => {
      const count = await responseRepo.deleteByMemberId('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('countBySessionAndQuestion', () => {
    it('counts responses matching session and question', async () => {
      await responseRepo.upsert({ memberId: 'm-1', sessionId: 's-1', questionId: 'q-1', score: 3 });
      await responseRepo.upsert({ memberId: 'm-2', sessionId: 's-1', questionId: 'q-1', score: 4 });
      await responseRepo.upsert({ memberId: 'm-3', sessionId: 's-1', questionId: 'q-2', score: 5 });

      const count = await responseRepo.countBySessionAndQuestion('s-1', 'q-1');
      expect(count).toBe(2);
    });

    it('returns 0 when no matching responses', async () => {
      const count = await responseRepo.countBySessionAndQuestion('s-1', 'q-1');
      expect(count).toBe(0);
    });
  });
});
