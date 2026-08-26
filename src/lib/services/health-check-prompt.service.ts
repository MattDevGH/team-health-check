/**
 * On-demand health check prompt service.
 *
 * Resolves what a Slack user should receive when they run `/healthcheck`:
 * their linked member, the team's open session, the outstanding questions for
 * their cadence preference, and an actionable session link.
 *
 * Availability is reported but never blocks: the member asked explicitly.
 * The away/reminder/delivery-window gates apply to bot-initiated prompts.
 *
 * Requirements: Integration 7.4, 8.4; Original 5.15, 5.16
 */

import crypto from 'node:crypto';

import type {
  AvailabilityRepository,
  QuestionRepository,
  ResponseRepository,
  SessionLinkRepository,
  SessionRepository,
  SlackIdentityLinkRepository,
  TeamMemberRepository,
} from '@/lib/repositories/types';
import type { Question } from '@/lib/repositories/entities';
import type { QuestionSelectionService } from '@/lib/services/question-selection.service';

const SESSION_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Outcome of an on-demand `/healthcheck` request. */
export type OnDemandPromptResult =
  | { kind: 'unlinked' }
  | { kind: 'no_active_session' }
  | { kind: 'all_answered'; sessionLinkUrl: string }
  | {
      kind: 'prompt';
      sessionId: string;
      questions: Question[];
      sessionLinkUrl: string;
      /** End of an active away period, or null when the member is available. */
      awayUntil: Date | null;
    };

export interface HealthCheckPromptServiceDeps {
  slackIdentityLinkRepo: SlackIdentityLinkRepository;
  teamMemberRepo: TeamMemberRepository;
  sessionRepo: SessionRepository;
  questionRepo: QuestionRepository;
  responseRepo: ResponseRepository;
  sessionLinkRepo: SessionLinkRepository;
  availabilityRepo: AvailabilityRepository;
  questionSelection: QuestionSelectionService;
  /** Base URL used to build the member's browser fallback link. */
  appUrl: string;
  now?: () => Date;
}

export interface HealthCheckPromptService {
  resolveOnDemandPrompt(slackUserId: string): Promise<OnDemandPromptResult>;
}

/**
 * Creates the service backing the `/healthcheck` slash command.
 */
export function createHealthCheckPromptService(
  deps: HealthCheckPromptServiceDeps,
): HealthCheckPromptService {
  const now = deps.now ?? (() => new Date());

  /** Reuses the member's session link, minting one if the session opened without it. */
  async function resolveSessionLinkUrl(memberId: string, sessionId: string): Promise<string> {
    const existing = await deps.sessionLinkRepo.findByMemberAndSession(memberId, sessionId);
    const link =
      existing ??
      (await deps.sessionLinkRepo.create({
        token: crypto.randomBytes(32).toString('hex'),
        memberId,
        sessionId,
        expiresAt: new Date(now().getTime() + SESSION_LINK_LIFETIME_MS),
      }));

    return `${deps.appUrl}/session/${link.token}`;
  }

  async function resolveOnDemandPrompt(slackUserId: string): Promise<OnDemandPromptResult> {
    const identity = await deps.slackIdentityLinkRepo.findBySlackUserId(slackUserId);
    if (!identity) {
      return { kind: 'unlinked' };
    }

    const member = await deps.teamMemberRepo.findById(identity.memberId);
    if (!member) {
      // The link outlived the member — treat as unlinked rather than leaking state.
      return { kind: 'unlinked' };
    }

    const session = await deps.sessionRepo.findOpenByTeamId(member.teamId);
    if (!session) {
      return { kind: 'no_active_session' };
    }

    const sessionLinkUrl = await resolveSessionLinkUrl(member.id, session.id);
    const outstanding = await findOutstandingQuestions(member.id, session.id);

    if (outstanding.length === 0) {
      return { kind: 'all_answered', sessionLinkUrl };
    }

    const selectedIds = await selectQuestionIds({
      memberId: member.id,
      sessionId: session.id,
      cadencePreference: member.cadencePreference,
      scheduledCloseAt: session.scheduledCloseAt,
      outstanding,
    });
    const away = await deps.availabilityRepo.findActiveByMemberIdAndDate(member.id, now());

    return {
      kind: 'prompt',
      sessionId: session.id,
      questions: outstanding.filter(question => selectedIds.has(question.id)),
      sessionLinkUrl,
      awayUntil: away?.awayUntil ?? null,
    };
  }

  /** Questions the member has not yet answered in this session, in display order. */
  async function findOutstandingQuestions(
    memberId: string,
    sessionId: string,
  ): Promise<Question[]> {
    const questions = await deps.questionRepo.findAll();
    const responses = await deps.responseRepo.findByMemberAndSession(memberId, sessionId);
    const answeredIds = new Set(responses.map(response => response.questionId));

    return questions.filter(question => !answeredIds.has(question.id));
  }

  /**
   * Micro-pulse members receive the weighted subset owned by QuestionSelectionService;
   * every other cadence receives all outstanding questions (Requirement 5.15).
   */
  async function selectQuestionIds(params: {
    memberId: string;
    sessionId: string;
    cadencePreference: string;
    scheduledCloseAt: Date | null;
    outstanding: Question[];
  }): Promise<Set<string>> {
    if (params.cadencePreference !== 'micro_pulse') {
      return new Set(params.outstanding.map(question => question.id));
    }

    const selection = await deps.questionSelection.selectForSessionLink(
      params.memberId,
      params.sessionId,
      params.cadencePreference,
      params.scheduledCloseAt,
    );

    return new Set(selection.questionIds);
  }

  return { resolveOnDemandPrompt };
}
