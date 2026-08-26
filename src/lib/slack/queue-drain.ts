/**
 * Replays queued Slack deliveries on a later scheduler tick.
 *
 * The queue holds two kinds of work — bot direct messages and replies to an
 * interaction's response_url — which need different transports, so the stored
 * descriptor decides how each entry is re-sent.
 *
 * Requirements: Original 5.12, 5.13; Integration 8.5
 */

import type { SlackApiClient } from '@/lib/slack/delivery';
import type { InteractionResponder } from '@/lib/slack/interaction-response';
import { decodeQueuedDelivery } from '@/lib/slack/queued-delivery';

export interface QueuedDeliveryDispatcherDeps {
  /** Absent when no SLACK_BOT_TOKEN is configured; direct messages then fail. */
  slackClient?: SlackApiClient;
  responder: InteractionResponder;
}

/**
 * Builds the delivery function passed to `processPending`.
 *
 * Returns false rather than throwing for anything undeliverable, so one bad
 * entry cannot abort the drain. A persistently undeliverable entry is retried
 * under the queue's normal backoff and is eventually marked permanently failed.
 */
export function createQueuedDeliveryDispatcher(
  deps: QueuedDeliveryDispatcherDeps,
): (responseUrl: string, payload: string) => Promise<boolean> {
  return async function dispatch(responseUrl: string, payload: string): Promise<boolean> {
    const delivery = decodeQueuedDelivery(payload);
    if (!delivery) {
      console.error('Unreadable queued Slack delivery; will retry until exhausted');
      return false;
    }

    if (delivery.kind === 'response_url') {
      return deps.responder.respond(delivery.responseUrl, delivery.text);
    }

    if (!deps.slackClient) {
      // No bot token configured — cannot replay a direct message
      return false;
    }

    const result = await deps.slackClient.postMessage({
      channel: delivery.slackUserId,
      blocks: delivery.blocks,
    });

    return result.ok;
  };
}
