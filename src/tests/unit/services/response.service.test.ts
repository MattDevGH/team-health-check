/**
 * Unit tests for ResponseService.upsert
 * Requirements: 3.6, 3.7, 3.8, 4.4, 4.5, 10.1, 10.2, 10.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createResponseService } from '@/lib/services/response.service';
import { ValidationError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';

describe('ResponseService.upsert', () => {
  let repos: Repositories;
  let responseService: ReturnType<typeof createResponseService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    responseService = createResponseService({
      responseRepo: repos.response,
      sessionRepo: repos.session,
      teamMemberRepo: repos.teamMember,
    });

    // Seed: team member belongs to team-1
    await repos.teamMember.create({ id: 'member-1', teamId: 'team-1', name: 'Alice' });
    // Seed: open session for team-1
    await repos.session.create({ teamId: 'team-1', status: 'open' });
  });

  it('creates a response for a valid submission', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    const response = await responseService.upsert({
      memberId: 'member-1',
      sessionId: session.id,
      questionId: 'q-delivering-value',
      score: 4,
    });

    expect(response).toBeDefined();
    expect(response.memberId).toBe('member-1');
    expect(response.sessionId).toBe(session.id);
    expect(response.questionId).toBe('q-delivering-value');
    expect(response.score).toBe(4);
    expect(response.trendIndicator).toBeNull();
  });

  it('creates a response with a valid trend indicator', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    const response = await responseService.upsert({
      memberId: 'member-1',
      sessionId: session.id,
      questionId: 'q-delivering-value',
      score: 3,
      trendIndicator: 'improving',
    });

    expect(response.trendIndicator).toBe('improving');
  });

  it('updates existing response on duplicate submission (same member/session/question)', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    const first = await responseService.upsert({
      memberId: 'member-1',
      sessionId: session.id,
      questionId: 'q-delivering-value',
      score: 3,
    });

    const second = await responseService.upsert({
      memberId: 'member-1',
      sessionId: session.id,
      questionId: 'q-delivering-value',
      score: 5,
      trendIndicator: 'improving',
    });

    expect(second.id).toBe(first.id);
    expect(second.score).toBe(5);
    expect(second.trendIndicator).toBe('improving');
  });

  it('throws ConflictError when session is closed', async () => {
    // Create and close a session
    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await repos.session.update(session.id, { status: 'closed', actualCloseAt: new Date() });

    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 4,
      })
    ).rejects.toThrow(ConflictError);
  });

  it('throws ForbiddenError when member does not belong to session team', async () => {
    // Create member in a different team
    await repos.teamMember.create({ id: 'member-2', teamId: 'team-2', name: 'Bob' });
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'member-2',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 4,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ValidationError when score is below 1', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 0,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when score is above 5', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 6,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when score is not an integer', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 3.5,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when trend indicator is invalid', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 4,
        trendIndicator: 'invalid-value',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when session does not exist', async () => {
    await expect(
      responseService.upsert({
        memberId: 'member-1',
        sessionId: 'non-existent-session',
        questionId: 'q-delivering-value',
        score: 4,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when member does not exist', async () => {
    const sessions = await repos.session.findByTeamId('team-1');
    const session = sessions[0];

    await expect(
      responseService.upsert({
        memberId: 'non-existent-member',
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: 4,
      })
    ).rejects.toThrow(NotFoundError);
  });
});


describe('ResponseService.getRollingAverage', () => {
  let repos: Repositories;
  let responseService: ReturnType<typeof createResponseService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    responseService = createResponseService({
      responseRepo: repos.response,
      sessionRepo: repos.session,
      teamMemberRepo: repos.teamMember,
    });

    // Seed team members
    await repos.teamMember.create({ id: 'member-1', teamId: 'team-1', name: 'Alice' });
    await repos.teamMember.create({ id: 'member-2', teamId: 'team-1', name: 'Bob' });
    await repos.teamMember.create({ id: 'member-3', teamId: 'team-1', name: 'Charlie' });
  });

  it('returns correct average for known scores', async () => {
    // Create a session and submit 5 responses with known scores: 1, 2, 3, 4, 5
    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });

    await repos.response.upsert({ memberId: 'member-1', sessionId: session.id, questionId: 'q-delivering-value', score: 1 });
    await repos.response.upsert({ memberId: 'member-2', sessionId: session.id, questionId: 'q-delivering-value', score: 2 });
    await repos.response.upsert({ memberId: 'member-3', sessionId: session.id, questionId: 'q-delivering-value', score: 3 });
    await repos.response.upsert({ memberId: 'member-1', sessionId: session.id, questionId: 'q-team-collaboration', score: 4 });

    // Need more for q-delivering-value — create another session
    const session2 = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await repos.response.upsert({ memberId: 'member-1', sessionId: session2.id, questionId: 'q-delivering-value', score: 4 });
    await repos.response.upsert({ memberId: 'member-2', sessionId: session2.id, questionId: 'q-delivering-value', score: 5 });

    // 5 responses for q-delivering-value: 1, 2, 3, 4, 5 → mean = 15/5 = 3.0
    const avg = await responseService.getRollingAverage('team-1', 'q-delivering-value');
    expect(avg).toBe(3);
  });

  it('returns null when fewer than 5 responses exist', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });

    // Only 4 responses
    await repos.response.upsert({ memberId: 'member-1', sessionId: session.id, questionId: 'q-delivering-value', score: 3 });
    await repos.response.upsert({ memberId: 'member-2', sessionId: session.id, questionId: 'q-delivering-value', score: 4 });
    await repos.response.upsert({ memberId: 'member-3', sessionId: session.id, questionId: 'q-delivering-value', score: 5 });

    const session2 = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await repos.response.upsert({ memberId: 'member-1', sessionId: session2.id, questionId: 'q-delivering-value', score: 2 });

    const avg = await responseService.getRollingAverage('team-1', 'q-delivering-value');
    expect(avg).toBeNull();
  });

  it('uses default count of 20 (limits to most recent 20)', async () => {
    // Create 22 responses across multiple sessions
    // The default count=20 means only the 20 most recent should be included
    const session1 = await repos.session.create({ teamId: 'team-1', status: 'closed' });
    const session2 = await repos.session.create({ teamId: 'team-1', status: 'open' });

    // Create enough members
    for (let i = 4; i <= 22; i++) {
      await repos.teamMember.create({ id: `gen-member-${i}`, teamId: 'team-1', name: `Member ${i}` });
    }

    // Session 1: 11 responses (all score=3)
    for (let i = 1; i <= 11; i++) {
      const memberId = i <= 3 ? `member-${i}` : `gen-member-${i}`;
      await repos.response.upsert({
        memberId,
        sessionId: session1.id,
        questionId: 'q-delivering-value',
        score: 3,
      });
    }

    // Session 2: 11 responses (all score=3)
    for (let i = 12; i <= 22; i++) {
      await repos.response.upsert({
        memberId: `gen-member-${i}`,
        sessionId: session2.id,
        questionId: 'q-delivering-value',
        score: 3,
      });
    }

    // Total: 22 responses, all score=3
    // With default count=20, result should still be 3.0 (since all scores are 3)
    const avg = await responseService.getRollingAverage('team-1', 'q-delivering-value');
    expect(avg).toBe(3);

    // With count=5, only 5 are used — still 3.0 since all are the same score
    const avgSmall = await responseService.getRollingAverage('team-1', 'q-delivering-value', 5);
    expect(avgSmall).toBe(3);
  });

  it('spans multiple sessions (responses from different sessions count)', async () => {
    // Session 1: 3 responses
    const session1 = await repos.session.create({ teamId: 'team-1', status: 'closed' });
    await repos.response.upsert({ memberId: 'member-1', sessionId: session1.id, questionId: 'q-delivering-value', score: 2 });
    await repos.response.upsert({ memberId: 'member-2', sessionId: session1.id, questionId: 'q-delivering-value', score: 3 });
    await repos.response.upsert({ memberId: 'member-3', sessionId: session1.id, questionId: 'q-delivering-value', score: 4 });

    // Session 2: 3 responses (total 6 ≥ 5 threshold)
    const session2 = await repos.session.create({ teamId: 'team-1', status: 'open' });
    await repos.response.upsert({ memberId: 'member-1', sessionId: session2.id, questionId: 'q-delivering-value', score: 3 });
    await repos.response.upsert({ memberId: 'member-2', sessionId: session2.id, questionId: 'q-delivering-value', score: 4 });
    await repos.response.upsert({ memberId: 'member-3', sessionId: session2.id, questionId: 'q-delivering-value', score: 5 });

    // Total: 2+3+4+3+4+5 = 21, mean = 21/6 = 3.5
    const avg = await responseService.getRollingAverage('team-1', 'q-delivering-value');
    expect(avg).toBe(3.5);
  });

  it('rounds to 1 decimal place', async () => {
    const session = await repos.session.create({ teamId: 'team-1', status: 'open' });

    // Create 6 members with scores: 1, 2, 3, 4, 5, 4 → sum=19, mean=19/6 ≈ 3.1667 → rounds to 3.2
    const scores = [1, 2, 3, 4, 5, 4];
    for (let i = 0; i < scores.length; i++) {
      const memberId = `rounding-member-${i}`;
      await repos.teamMember.create({ id: memberId, teamId: 'team-1', name: `Rounding ${i}` });
      await repos.response.upsert({
        memberId,
        sessionId: session.id,
        questionId: 'q-delivering-value',
        score: scores[i],
      });
    }

    const avg = await responseService.getRollingAverage('team-1', 'q-delivering-value');
    // 19/6 = 3.16666... → rounded to 1 decimal = 3.2
    expect(avg).toBe(3.2);
  });
});
