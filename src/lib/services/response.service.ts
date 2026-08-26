/**
 * Response submission service.
 * Requirements: 3.6, 3.7, 3.8, 4.4, 4.5, 10.1, 10.2, 10.3
 * NFR 4.3, 4.5, 4.6, 4.7: GDPR self-service data deletion
 */

import crypto from 'crypto';
import type { ResponseRepository, SessionRepository, TeamMemberRepository, AuditLogRepository } from '@/lib/repositories/types';
import type { Response } from '@/lib/repositories/entities';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors';

const VALID_TREND_INDICATORS = ['improving', 'stable', 'declining'] as const;

export interface ResponseServiceDeps {
  responseRepo: ResponseRepository;
  sessionRepo: SessionRepository;
  teamMemberRepo: TeamMemberRepository;
  auditLogRepo?: AuditLogRepository;
}

export interface ResponseService {
  upsert(params: {
    memberId: string;
    sessionId: string;
    questionId: string;
    score: number;
    trendIndicator?: string;
  }): Promise<Response>;
  getRollingAverage(teamId: string, questionId: string, count?: number): Promise<number | null>;
  deleteMyData(memberId: string): Promise<void>;
}

/**
 * Factory function for creating the response service.
 */
export function createResponseService(deps: ResponseServiceDeps): ResponseService {
  const { responseRepo, sessionRepo, teamMemberRepo, auditLogRepo } = deps;

  async function upsert(params: {
    memberId: string;
    sessionId: string;
    questionId: string;
    score: number;
    trendIndicator?: string;
  }): Promise<Response> {
    // 1. Validate score is integer 1-5
    if (!Number.isInteger(params.score) || params.score < 1 || params.score > 5) {
      throw new ValidationError([
        { field: 'score', message: 'Score must be an integer between 1 and 5', code: 'INVALID_SCORE' },
      ]);
    }

    // 2. Validate trend indicator if provided
    if (
      params.trendIndicator !== undefined &&
      !VALID_TREND_INDICATORS.includes(params.trendIndicator as typeof VALID_TREND_INDICATORS[number])
    ) {
      throw new ValidationError([
        {
          field: 'trendIndicator',
          message: 'Trend indicator must be one of: improving, stable, declining',
          code: 'INVALID_TREND_INDICATOR',
        },
      ]);
    }

    // 3. Find session by ID — throw NotFoundError if not found
    const session = await sessionRepo.findById(params.sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // 4. Check session status === 'open' — throw ConflictError if closed
    if (session.status !== 'open') {
      throw new ConflictError('Session is closed');
    }

    // 5. Find member — throw NotFoundError if not found
    const member = await teamMemberRepo.findById(params.memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // 6. Check member belongs to team — throw ForbiddenError if not
    if (member.teamId !== session.teamId) {
      throw new ForbiddenError('Member does not belong to the session team');
    }

    // 7. Upsert response via responseRepo.upsert()
    const response = await responseRepo.upsert({
      memberId: params.memberId,
      sessionId: params.sessionId,
      questionId: params.questionId,
      score: params.score,
      trendIndicator: params.trendIndicator,
    });

    return response;
  }

  async function getRollingAverage(
    teamId: string,
    questionId: string,
    count = 20,
  ): Promise<number | null> {
    // 1. Get recent responses for this team + question
    const responses = await responseRepo.findRecentByTeamAndQuestion(teamId, questionId, count);

    // 2. If fewer than 5 responses, return null
    if (responses.length < 5) {
      return null;
    }

    // 3. Take at most `count` responses (already limited by repo query)
    const subset = responses.slice(0, count);

    // 4. Calculate arithmetic mean, round to 1 decimal place
    const sum = subset.reduce((acc, r) => acc + r.score, 0);
    const average = Math.round((sum / subset.length) * 10) / 10;

    // 5. Return average
    return average;
  }

  /**
   * GDPR self-service: delete all response data for a member.
   * Preserves materialised aggregates (computed at session close).
   * Logs an audit entry without recording deleted data content.
   * Requirements: NFR 4.3, 4.5, 4.6, 4.7
   */
  async function deleteMyData(memberId: string): Promise<void> {
    // 1. Find the member to get their teamId
    const member = await teamMemberRepo.findById(memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // 2. Delete all response records for this member
    await responseRepo.deleteByMemberId(memberId);

    // 3. Materialised aggregates are NOT affected (computed at session close)

    // 4. Log audit entry with hashed memberId (never log deleted data)
    if (auditLogRepo) {
      const hashedId = crypto.createHash('sha256').update(memberId).digest('hex').substring(0, 8);
      await auditLogRepo.create({
        teamId: member.teamId,
        changeType: 'data_deletion',
        previousValue: '',
        newValue: '',
        userId: `deleted:${hashedId}`,
      });
    }
  }

  return { upsert, getRollingAverage, deleteMyData };
}
