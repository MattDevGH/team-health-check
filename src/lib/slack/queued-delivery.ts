/**
 * Replayable descriptor for a Slack delivery that failed and was queued.
 *
 * A queued entry is retried by a later scheduler tick, in a different process
 * from the one that created it, so the entry must carry everything needed to
 * deliver it again. Anything resolved during the original request — the
 * member's Slack link, the built blocks, the interaction's response_url — is
 * gone by then.
 *
 * Requirements: Original 5.13; Integration 8.5
 */

/** A queued delivery, discriminated by how it must be re-sent. */
export type QueuedDelivery =
  | {
      /** Direct message through the Slack Web API. */
      kind: 'dm';
      memberId: string;
      slackUserId: string;
      blocks: unknown[];
    }
  | {
      /** Reply to an interaction's one-off response_url. */
      kind: 'response_url';
      responseUrl: string;
      text: string;
    }
  | {
      /**
       * Score buttons that have been accepted but not yet applied.
       *
       * Requirements: NFR 1.2; Slack Sign In NFR 1.1
       *
       * The interaction route acknowledges Slack before doing the work, and
       * unawaited work in a serverless function may simply stop when the
       * response is flushed. So the work is written down first and applied
       * afterwards: if the instance dies between the two, a later scheduler
       * tick finds the entry and applies it.
       *
       * Carries the decoded actions rather than the raw payload. The signature
       * has already been verified by the time this is written, and re-verifying
       * on replay would be impossible anyway — the timestamp would be minutes
       * old and fail the five-minute replay window.
       */
      kind: 'score_actions';
      slackUserId: string;
      actions: Array<{ actionId?: string; value?: string }>;
      responseUrl?: string;
    };

export function encodeQueuedDelivery(delivery: QueuedDelivery): string {
  return JSON.stringify(delivery);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Parses a stored descriptor, returning null for anything unrecognised.
 *
 * Never throws: a single malformed row must not stop the drain from processing
 * the rest of the queue.
 */
export function decodeQueuedDelivery(raw: string): QueuedDelivery | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  if (parsed.kind === 'dm') {
    if (
      !isNonEmptyString(parsed.memberId) ||
      !isNonEmptyString(parsed.slackUserId) ||
      !Array.isArray(parsed.blocks)
    ) {
      return null;
    }
    return {
      kind: 'dm',
      memberId: parsed.memberId,
      slackUserId: parsed.slackUserId,
      blocks: parsed.blocks,
    };
  }

  if (parsed.kind === 'score_actions') {
    if (!isNonEmptyString(parsed.slackUserId) || !Array.isArray(parsed.actions)) {
      return null;
    }

    return {
      kind: 'score_actions',
      slackUserId: parsed.slackUserId,
      // Keep only entries shaped like actions; a malformed one is dropped
      // rather than taken on trust, the same rule the live route follows
      actions: parsed.actions.filter(isRecord).map(entry => ({
        actionId: isNonEmptyString(entry.action_id)
          ? entry.action_id
          : isNonEmptyString(entry.actionId)
            ? entry.actionId
            : undefined,
        value: isNonEmptyString(entry.value) ? entry.value : undefined,
      })),
      responseUrl: isNonEmptyString(parsed.responseUrl) ? parsed.responseUrl : undefined,
    };
  }

  if (parsed.kind === 'response_url') {
    if (!isNonEmptyString(parsed.responseUrl) || typeof parsed.text !== 'string') {
      return null;
    }
    return {
      kind: 'response_url',
      responseUrl: parsed.responseUrl,
      text: parsed.text,
    };
  }

  return null;
}
