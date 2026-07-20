/**
 * Production notification sink that delivers messages via Slack API.
 * On failure, persists to SlackInteractionQueue for retry.
 * Requirements: 8.1, 8.3, 8.5
 */
import type { NotificationSink } from '@/lib/services/notification.service';
import type { SlackApiClient } from '@/lib/slack/delivery';
import type { InteractionQueueRepository } from '@/lib/slack/interaction-queue';
import type { SlackIdentityLinkRepository, QuestionRepository, SessionLinkRepository } from '@/lib/repositories/types';
import { deliverSlackMessage } from '@/lib/slack/delivery';
import { buildPromptMessage } from '@/lib/slack/message-builder';

export interface ProductionNotificationSinkDeps {
  slackClient: SlackApiClient;
  slackIdentityLinkRepo: SlackIdentityLinkRepository;
  slackInteractionQueueRepo: InteractionQueueRepository;
  questionRepo: QuestionRepository;
  sessionLinkRepo: SessionLinkRepository;
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
    retryDelayMs,
  } = deps;

  return {
    async send(memberId: string, type: string, payload: unknown): Promise<void> {
      // 1. Look up Slack identity link for the member
      const link = await slackIdentityLinkRepo.findByMemberId(memberId);
      if (!link) return; // No Slack link — skip silently

      // 2. Build the Slack message
      const questions = await questionRepo.findAll();
      const sessionId = (payload as { sessionId?: string })?.sessionId;

      let sessionLinkUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      if (sessionId) {
        const sessionLink = await sessionLinkRepo.findByMemberAndSession(memberId, sessionId);
        if (sessionLink) {
          sessionLinkUrl = `${sessionLinkUrl}/session/${sessionLink.token}`;
        }
      }

      const message = buildPromptMessage({ questions, sessionLinkUrl });

      // 3. Deliver via Slack API with retry logic
      const result = await deliverSlackMessage({
        slackClient,
        slackUserId: link.slackUserId,
        blocks: message.blocks,
        retryDelayMs,
      });

      // 4. On failure → queue to SlackInteractionQueue for retry
      if (!result.success) {
        await slackInteractionQueueRepo.add({
          interactionPayload: JSON.stringify({ memberId, type, payload }),
          responseUrl: '',
          failureReason: result.error ?? 'delivery_failed',
        });
      }
    },
  };
}
