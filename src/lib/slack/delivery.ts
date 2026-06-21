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
}): Promise<DeliveryResult> {
  const { slackClient, slackUserId, blocks } = params;
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

  // All retries exhausted
  console.error(`Slack delivery failed after ${MAX_RETRIES} attempts: ${lastError}`);
  return { success: false, attempts: MAX_RETRIES, error: lastError };
}
