/**
 * Production notification sink that delivers messages via Slack API.
 * On failure, persists to SlackInteractionQueue for retry.
 * Requirements: 8.1, 8.3, 8.5
 */
import type { NotificationSink } from '@/lib/services/notification.service';
import type { SlackApiClient } from '@/lib/slack/delivery';
import type { InteractionQueueRepository } from '@/lib/slack/interaction-queue';
import type {
  SlackIdentityLinkRepository,
  QuestionRepository,
  SessionLinkRepository,
  ResponseRepository,
  SessionRepository,
} from '@/lib/repositories/types';
import type { Question } from '@/lib/repositories/entities';
import { deliverSlackMessage } from '@/lib/slack/delivery';
import { buildClosingReminderMessage, buildPromptMessage } from '@/lib/slack/message-builder';
import { encodeQueuedDelivery } from '@/lib/slack/queued-delivery';

export interface ProductionNotificationSinkDeps {
  slackClient: SlackApiClient;
  slackIdentityLinkRepo: SlackIdentityLinkRepository;
  slackInteractionQueueRepo: InteractionQueueRepository;
  questionRepo: QuestionRepository;
  sessionLinkRepo: SessionLinkRepository;
  /**
   * Used to show only outstanding questions. Optional so focused tests that do
   * not exercise question narrowing can omit them; production wiring injects both.
   */
  responseRepo?: ResponseRepository;
  sessionRepo?: SessionRepository;
  /** Override retry delay for testing. Defaults to 5000ms (Slack delivery default). */
  retryDelayMs?: number;
}

/**
 * Factory that creates a NotificationSink backed by the Slack API.
 *
 * Behavior:
 * 1. Looks up the member's Slack identity link
 * 2. If no link exists → returns silently (no error)
 * 3. Builds a prompt message and delivers via Slack API with retry
 * 4. On delivery failure → persists to SlackInteractionQueue for retry
 */
export function createProductionNotificationSink(deps: ProductionNotificationSinkDeps): NotificationSink {
  const {
    slackClient,
    slackIdentityLinkRepo,
    slackInteractionQueueRepo,
    questionRepo,
    sessionLinkRepo,
    responseRepo,
    sessionRepo,
    retryDelayMs,
  } = deps;

  /** Questions the member has not answered yet in this session. */
  async function outstandingQuestions(
    memberId: string,
    sessionId: string | undefined,
  ): Promise<Question[]> {
    const questions = await questionRepo.findAll();
    if (!responseRepo || !sessionId) return questions;

    const responses = await responseRepo.findByMemberAndSession(memberId, sessionId);
    const answered = new Set(responses.map(response => response.questionId));

    return questions.filter(question => !answered.has(question.id));
  }

  return {
    async send(memberId: string, type: string, payload: unknown): Promise<void> {
      // 1. Look up Slack identity link for the member
      const link = await slackIdentityLinkRepo.findByMemberId(memberId);
      if (!link) return; // No Slack link — skip silently

      // 2. Build the Slack message for this notification type
      const sessionId = (payload as { sessionId?: string })?.sessionId;
      const questions = await outstandingQuestions(memberId, sessionId);

      let sessionLinkUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      if (sessionId) {
        const sessionLink = await sessionLinkRepo.findByMemberAndSession(memberId, sessionId);
        if (sessionLink) {
          sessionLinkUrl = `${sessionLinkUrl}/session/${sessionLink.token}`;
        }
      }

      // Requirement 13.4: a reminder must read as a reminder, not as a fresh
      // invitation, and must say when the window closes.
      let message;
      if (type === 'closing_reminder') {
        const session = sessionId && sessionRepo ? await sessionRepo.findById(sessionId) : null;
        message = buildClosingReminderMessage({
          questions,
          sessionLinkUrl,
          closesAt: session?.scheduledCloseAt ?? null,
        });
      } else {
        message = buildPromptMessage({ questions, sessionLinkUrl });
      }

      // 3. Deliver via Slack API with retry logic
      const result = await deliverSlackMessage({
        slackClient,
        slackUserId: link.slackUserId,
        blocks: message.blocks,
        retryDelayMs,
      });

      // 4. On failure → queue a replayable descriptor for a later tick to retry.
      // The blocks and resolved Slack user are stored, not the internal payload,
      // because the retry runs in a different process with none of this context.
      if (!result.success) {
        await slackInteractionQueueRepo.add({
          interactionPayload: encodeQueuedDelivery({
            kind: 'dm',
            memberId,
            slackUserId: link.slackUserId,
            blocks: message.blocks,
          }),
          responseUrl: '',
          failureReason: result.error ?? 'delivery_failed',
        });
      }
    },
  };
}
