/**
 * Session lifecycle service.
 * Requirements: 3.2, 3.4, 3.9, 3.10, 6.1, 8.1
 */

import crypto from 'node:crypto';
import type {
  SessionRepository,
  SessionLinkRepository,
  TeamMemberRepository,
  ResponseRepository,
  SessionAggregateRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession } from '@/lib/repositories/entities';
import { NotFoundError, ConflictError } from '@/lib/errors';

export interface SessionServiceDeps {
  sessionRepo: SessionRepository;
  sessionLinkRepo: SessionLinkRepository;
  teamMemberRepo: TeamMemberRepository;
  responseRepo: ResponseRepository;
  sessionAggregateRepo: SessionAggregateRepository;
}

export interface SessionService {
  open(teamId: string, userId: string): Promise<HealthCheckSession>;
  close(sessionId: string, userId?: string): Promise<void>;
  generateSessionLinks(sessionId: string): Promise<void>;
  materializeAggregates(sessionId: string): Promise<void>;
}

/**
 * Factory function for creating the session service.
 */
export function createSessionService(deps: SessionServiceDeps): SessionService {
  const { sessionRepo, sessionLinkRepo, teamMemberRepo, responseRepo, sessionAggregateRepo } = deps;

  async function generateSessionLinks(sessionId: string): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const members = await teamMemberRepo.findByTeamId(session.teamId);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // If session is closed, expiry is 7 days after close; otherwise 7 days from now
    const baseTime = session.actualCloseAt ? session.actualCloseAt.getTime() : Date.now();
    const expiresAt = new Date(baseTime + sevenDaysMs);

    for (const member of members) {
      const token = crypto.randomBytes(32).toString('hex');
      await sessionLinkRepo.create({
        token,
        memberId: member.id,
        sessionId: session.id,
        expiresAt,
      });
    }
  }

  async function open(teamId: string, _userId: string): Promise<HealthCheckSession> {
    // Enforce at-most-one open session: close existing open session
    const existing = await sessionRepo.findOpenByTeamId(teamId);
    if (existing) {
      await sessionRepo.update(existing.id, {
        status: 'closed',
        actualCloseAt: new Date(),
      });
    }

    // Create new open session
    const session = await sessionRepo.create({
      teamId,
      status: 'open',
    });

    // Generate session links for all team members
    await generateSessionLinks(session.id);

    return session;
  }

  async function close(sessionId: string, _userId?: string): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    if (session.status === 'closed') {
      throw new ConflictError('Session is already closed');
    }
    await sessionRepo.update(sessionId, {
      status: 'closed',
      actualCloseAt: new Date(),
    });
  }

  /**
   * Materialise aggregates for a closed session.
   * Computes average score (1 decimal), response count, and trend indicator
   * distribution per question.
   * Requirement: 8.1, NFR 4.2
   */
  async function materializeAggregates(sessionId: string): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const responses = await responseRepo.findBySession(sessionId);

    // Group responses by questionId
    const byQuestion = new Map<string, typeof responses>();
    for (const response of responses) {
      const existing = byQuestion.get(response.questionId) ?? [];
      existing.push(response);
      byQuestion.set(response.questionId, existing);
    }

    // For each question with responses, compute and store aggregate
    for (const [questionId, questionResponses] of byQuestion) {
      if (questionResponses.length === 0) continue;

      const sum = questionResponses.reduce((acc, r) => acc + r.score, 0);
      const averageScore = Math.round((sum / questionResponses.length) * 10) / 10;
      const responseCount = questionResponses.length;

      let improvingCount = 0;
      let stableCount = 0;
      let decliningCount = 0;
      for (const r of questionResponses) {
        if (r.trendIndicator === 'improving') improvingCount++;
        else if (r.trendIndicator === 'stable') stableCount++;
        else if (r.trendIndicator === 'declining') decliningCount++;
      }

      await sessionAggregateRepo.create({
        sessionId,
        questionId,
        averageScore,
        responseCount,
        improvingCount,
        stableCount,
        decliningCount,
      });
    }
  }

  return { open, close, generateSessionLinks, materializeAggregates };
}
