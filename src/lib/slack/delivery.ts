import { recorder as defaultRecorder, type Recorder } from '@/lib/observability';

/**
 * Slack message delivery with retry logic.
 * Requirements 5.12: Retry delivery up to 3 times with minimum 5s interval.
 * Requirements 5.13: Only deliver to members with linked Slack identity.
 */

export interface SlackApiClient {
  postMessage(params: { channel: string; blocks: unknown[] }): Promise<{ ok: boolean; error?: string }>;
}

export interface DeliveryResult {
  success: boolean;
  attempts: number;
  error?: string;
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

/**
 * Creates a SlackApiClient that calls the Slack Web API via fetch.
 * Requirement 8.3: Production notification sink calls Slack API.
 */
export function createSlackApiClient(botToken: string): SlackApiClient {
  return {
    async postMessage(params: { channel: string; blocks: unknown[] }): Promise<{ ok: boolean; error?: string }> {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: params.channel,
          blocks: params.blocks,
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { ok: boolean; error?: string };
      return { ok: data.ok, error: data.error };
    },
  };
}

/**
 * Delivers a Slack message with retry logic.
 * Retries up to 3 times with a configurable delay between attempts (default 5s).
 * Logs to console.error if all retries are exhausted.
 *
 * The caller is responsible for checking Slack identity link status before calling
 * this function (Requirement 5.13).
 */
export async function deliverSlackMessage(params: {
  slackClient: SlackApiClient;
  slackUserId: string;
  blocks: unknown[];
  retryDelayMs?: number;
  /** Injectable so a test can read what was recorded rather than spy on a call. */
  recorder?: Recorder;
}): Promise<DeliveryResult> {
  const { slackClient, slackUserId, blocks } = params;
  const recorder = params.recorder ?? defaultRecorder;
  const retryDelay = params.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await slackClient.postMessage({
        channel: slackUserId,
        blocks,
      });

      if (result.ok) {
        return { success: true, attempts: attempt };
      }

      lastError = result.error ?? 'Unknown Slack API error';
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : 'Network error';
    }

    // Wait before retry (except on last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  /*
   * All retries exhausted.
   *
   * This said `Slack delivery failed after 3 attempts: Error` and nothing else
   * — not which member, team or check. A line that cannot be attributed cannot
   * be acted on, and one failing member looked exactly like a broken
   * integration.
   *
   * The Slack user id is the member as Slack knows them, which is what makes
   * this findable next to the workspace it failed in.
   */
  recorder.error('slack.delivery.exhausted', {
    channel: slackUserId,
    attempts: MAX_RETRIES,
    message: lastError ?? 'no reason reported',
  });
  return { success: false, attempts: MAX_RETRIES, error: lastError };
}
