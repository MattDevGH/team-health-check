/**
 * POST /api/slack/interactions
 *
 * Handles Slack interaction callbacks (button clicks, menu selections).
 * Uses immediate ack pattern: respond 200 within 3 seconds, process scores.
 *
 * Architecture: Verify signature → parse payload → ack → process scores.
 *
 * Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, NFR 1.2
 */

import { withErrorHandling } from '@/lib/api-utils';
import { verifySlackSignature } from '@/lib/slack/verify-signature';
import { container, repos } from '@/lib/container-production';
import { createInteractionResponder } from '@/lib/slack/interaction-response';
import type { InteractionResponder } from '@/lib/slack/interaction-response';
import { decodeInteractionPayload } from '@/lib/slack/interaction-payload';
import { after } from 'next/server';

import { createInteractionQueue } from '@/lib/slack/interaction-queue';
import { encodeQueuedDelivery } from '@/lib/slack/queued-delivery';
import { createQueuedDeliveryDispatcher } from '@/lib/slack/queue-drain';
import { createProductionScoreActionDeps } from '@/lib/slack/production-score-actions';

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

let _responderOverride: InteractionResponder | null = null;

/** Test seam: replaces the response_url sender so tests make no network calls. */
export function _setInteractionResponder(responder: InteractionResponder): void {
  _responderOverride = responder;
}

function getResponder(): InteractionResponder {
  return _responderOverride ?? createInteractionResponder();
}

type AfterResponse = (work: () => Promise<void>) => void | Promise<void>;

let _afterOverride: AfterResponse | null = null;

/**
 * Test seam: replaces Next's `after` so a test can run the work and wait for
 * it. `after` needs a request context this route does not have when POST is
 * called directly, and a test that could not await the work could only assert
 * that a 200 came back — which is the half that was never in doubt.
 */
export function _setAfterResponse(fn: AfterResponse | null): void {
  _afterOverride = fn;
}

function afterResponse(work: () => Promise<void>): void | Promise<void> {
  return (_afterOverride ?? after)(work);
}

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const body = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  // Verify Slack request signature (replay protection + HMAC)
  verifySlackSignature({ signature, timestamp, body });

  // Slack sends interactions as form-encoded with a 'payload' field
  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    return new Response('Missing payload', { status: 400 });
  }

  /**
   * Requirement: Slack Sign In NFR 1.5
   *
   * This was `const payload: SlackInteractionPayload = JSON.parse(payloadStr)`
   * — an unchecked `any` asserted into a shape, at a trust boundary. A body
   * that was not JSON threw out of the handler rather than being refused.
   */
  const payload = decodeInteractionPayload(payloadStr);
  if (payload === null) {
    return new Response('Malformed payload', { status: 400 });
  }

  /*
   * Requirements: NFR 1.2; Slack Sign In NFR 1.1
   *
   * Write the work down, acknowledge, then do it.
   *
   * This route used to resolve the member, look up the open session, upsert a
   * response per button, fetch a question title for each, and POST an outbound
   * reply — all before returning the 200 Slack waits three seconds for. Its
   * own header described the opposite. Under ordinary Turso latency that
   * budget is not generous, and the outbound reply had no timeout until
   * 2026-09-25.
   *
   * Not `void process(...)`: a serverless runtime may stop unawaited work once
   * the response is flushed, which would trade a visible failure for a silently
   * dropped answer. The buttons go into the durable queue first, so if this
   * instance stops between acknowledging and applying, a later scheduler tick
   * finds them. Draining immediately afterwards is what keeps the member's
   * confirmation quick rather than up to a tick away.
   */
  if (payload.type === 'block_actions' && payload.user?.id) {
    const queue = createInteractionQueue({ repo: repos.interactionQueue });

    await queue.enqueue({
      interactionPayload: encodeQueuedDelivery({
        kind: 'score_actions',
        slackUserId: payload.user.id,
        actions: payload.actions ?? [],
        responseUrl: payload.responseUrl,
      }),
      responseUrl: payload.responseUrl ?? '',
      failureReason: 'Accepted, not yet applied',
    });

    const drain = afterResponse(async () => {
      try {
        await queue.processPending(
          createQueuedDeliveryDispatcher({
            responder: getResponder(),
            scoreActions: createProductionScoreActionDeps(),
          }),
          new Date(),
        );
      } catch (error: unknown) {
        /*
         * The acknowledgement is unconditional (NFR 1.2). Whatever went wrong
         * here, the entry is still pending in the queue and a later tick will
         * try again — letting this reach the response would turn a retryable
         * failure into one Slack sees, and Slack retries by replaying the
         * whole interaction.
         */
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Slack scores queued but not applied inline: ${message}`);
      }
    });

    // Only a test seam returns anything; Next's `after` returns void
    if (drain) await drain;
  }

  // Return 200 to acknowledge (Slack requires response within 3 seconds)
  return new Response(null, { status: 200 });
});
