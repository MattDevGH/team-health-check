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
  TeamScheduleRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession } from '@/lib/repositories/entities';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { nextOccurrenceUtc } from '@/lib/local-time';

export interface SessionServiceDeps {
  sessionRepo: SessionRepository;
  sessionLinkRepo: SessionLinkRepository;
  teamMemberRepo: TeamMemberRepository;
  responseRepo: ResponseRepository;
  /**
   * Supplies the team's configured close day/time. Omitted only by focused tests
   * that do not exercise the scheduled window; production wiring always injects it.
   */
  teamScheduleRepo?: TeamScheduleRepository;
  now?: () => Date;
}

export interface SessionService {
  open(teamId: string, userId: string): Promise<HealthCheckSession>;
  get(expectedTeamId: string, sessionId: string): Promise<HealthCheckSession>;
  close(expectedTeamId: string, sessionId: string, userId?: string): Promise<void>;
  generateSessionLinks(sessionId: string): Promise<void>;
  materializeAggregates(sessionId: string): Promise<void>;
}

/**
 * Factory function for creating the session service.
 */
/** Requirement 6.6: a link outlives its session by a week and no longer. */
const SESSION_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const {
    sessionRepo,
    sessionLinkRepo,
    teamMemberRepo,
    responseRepo,
    teamScheduleRepo,
  } = deps;
  const now = deps.now ?? (() => new Date());

  async function generateSessionLinks(sessionId: string): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const members = await teamMemberRepo.findByTeamId(session.teamId);

    // If session is closed, expiry is 7 days after close; otherwise 7 days from now
    const baseTime = session.actualCloseAt ? session.actualCloseAt.getTime() : Date.now();
    const expiresAt = new Date(baseTime + SESSION_LINK_LIFETIME_MS);

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
    // Enforce at-most-one open session: the previous one closes as part of
    // opening this cycle, in the same transaction (NFR 3.5)
    const existing = await sessionRepo.findOpenByTeamId(teamId);

    // Record the cycle's scheduled window so closing reminders and micro-pulse
    // bundling have a real close time to work from (design.md).
    const openedAt = now();
    const schedule = (await teamScheduleRepo?.findByTeamId(teamId)) ?? null;
    const scheduledWindow = schedule
      ? {
          scheduledOpenAt: openedAt,
          scheduledCloseAt: nextOccurrenceUtc(
            openedAt,
            schedule.closeDay,
            schedule.closeTime,
            schedule.timezone || 'UTC',
          ),
        }
      : {};

    /*
     * Requirements: NFR 3.5, NFR 3.6; 6.1
     *
     * One outcome: the previous session closes, the new one is created, and
     * every member gets a link.
     *
     * These were three steps. A failure after the session was created left a
     * check nobody could answer — which happened in production on 2026-09-14
     * and is why `reaching-your-health-check` exists. A failure part-way
     * through the links left some of the team able to reach it and the rest
     * not, which is worse, because the check looks fine to whoever opened it.
     *
     * One clock for the whole row. Left to the repository this was
     * `new Date()`, so a tick given a past date created a session claiming to
     * have opened today — and the scheduler reads exactly this field to decide
     * whether the current cycle has already been served.
     */
    const members = await teamMemberRepo.findByTeamId(teamId);
    const expiresAt = new Date(openedAt.getTime() + SESSION_LINK_LIFETIME_MS);

    return sessionRepo.openCycle({
      closeExisting: existing ? { id: existing.id, closedAt: openedAt } : undefined,
      session: {
        teamId,
        status: 'open',
        actualOpenAt: openedAt,
        ...scheduledWindow,
      },
      links: members.map(member => ({
        token: crypto.randomBytes(32).toString('hex'),
        memberId: member.id,
        expiresAt,
      })),
    });
  }

  async function get(
    expectedTeamId: string,
    sessionId: string,
  ): Promise<HealthCheckSession> {
    const session = await sessionRepo.findById(sessionId);
    if (!session || session.teamId !== expectedTeamId) {
      throw new NotFoundError('Session not found');
    }
    return session;
  }

  async function close(
    expectedTeamId: string,
    sessionId: string,
    _userId?: string,
  ): Promise<void> {
    const session = await sessionRepo.findById(sessionId);
    if (!session || session.teamId !== expectedTeamId) {
      throw new NotFoundError('Session not found');
    }
    if (session.status === 'closed') {
      throw new ConflictError('Session is already closed');
    }
    await sessionRepo.update(sessionId, {
      status: 'closed',
      actualCloseAt: now(),
    });

    /**
     * Requirement 18.4
     *
     * A response in a closed session is final whether or not its author said
     * so, because nothing can change it any more. Stamping it here rather than
     * inferring it at read time keeps the rolling average's filter to one
     * condition, and means a member who never marked their answers final is
     * still counted (Requirement 18.7).
     */
    await responseRepo.finaliseForSession(sessionId, now());
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

    // Compute every aggregate before writing any of them
    const aggregates = [];

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

      aggregates.push({
        questionId,
        averageScore,
        responseCount,
        improvingCount,
        stableCount,
        decliningCount,
      });
    }

    /*
     * Requirements: NFR 3.5, NFR 3.6
     *
     * One write, covering the aggregates and the timestamp that says the work
     * was done.
     *
     * This was a create per question followed by a separate update. A failure
     * part-way left some rows written and the timestamp unset, and
     * `(sessionId, questionId)` is unique — so the retry collided with the
     * rows the failed attempt had already made and threw. The session could
     * never be materialised again and nothing in the application could repair
     * it.
     *
     * The timestamp is recorded whether or not there were any aggregates. A
     * check nobody answered produces none, which is otherwise
     * indistinguishable from never having been computed: the scheduler used to
     * infer "already done" from their presence and so re-ran materialisation
     * on every empty session on every tick, for ever.
     */
    await sessionRepo.materialise(sessionId, aggregates, now());
  }

  return { open, get, close, generateSessionLinks, materializeAggregates };
}
