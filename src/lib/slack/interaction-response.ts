/**
 * Replies to a Slack interaction through its one-off `response_url`.
 *
 * This is a different transport from `delivery.ts`: the Web API
 * (`chat.postMessage`) needs a bot token and posts a new message, whereas a
 * response_url is an unauthenticated POST that Slack supplies per interaction
 * and is the only way to follow up an ephemeral message — `chat.update` cannot
 * touch one.
 *
 * A single attempt only. Slack requires the interaction acknowledged within
 * three seconds, so inline retries would risk the ack budget; durable retry of
 * exhausted deliveries is Task 24.4 (Original 5.13).
 *
 * Requirements: Original 5.7, 5.8, 5.9
 */

/** Sends a member-visible reply for a Slack interaction. */
export interface InteractionResponder {
  /** Returns true when Slack accepted the reply. Never throws. */
  respond(responseUrl: string, text: string): Promise<boolean>;
}

export interface InteractionResponderDeps {
  fetchImpl?: typeof fetch;
}

/**
 * Creates the production responder.
 * `replace_original: false` keeps the prompt and its score buttons in place so
 * the member can still change an answer (Requirement 5.10).
 */
export function createInteractionResponder(
  deps: InteractionResponderDeps = {},
): InteractionResponder {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    async respond(responseUrl: string, text: string): Promise<boolean> {
      try {
        const response = await fetchImpl(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            replace_original: false,
            text,
          }),
        });

        if (!response.ok) {
          console.error(`Slack interaction reply failed: HTTP ${response.status}`);
          return false;
        }

        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Network error';
        console.error(`Slack interaction reply failed: ${message}`);
        return false;
      }
    },
  };
}

/** Confirmation for a stored score (Requirement 5.8). */
export function buildConfirmationText(questionTitle: string, score: number): string {
  return `:white_check_mark: Recorded *${score}* for *${questionTitle}*. You can change it any time before the session closes.`;
}

/** Validation error for a score outside 1–5 (Requirement 5.7). */
export function buildScoreRejectionText(questionTitle: string): string {
  return `:warning: Could not record your answer for *${questionTitle}* — scores must be between 1 and 5.`;
}

/** Rejection when the session is no longer open (Requirement 5.9). */
export function buildSessionEndedText(): string {
  return 'This health check session has ended, so your response was not recorded.';
}

/** Guidance for a Slack user with no linked member. */
export function buildUnlinkedText(): string {
  return 'Your Slack account is not linked to a Team Health Check member.\nUse `/healthcheck connect` to generate a pairing code and link your account.';
}
