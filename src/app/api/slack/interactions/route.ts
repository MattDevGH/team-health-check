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
import { applyScoreActions } from '@/lib/slack/score-actions';
import type { SlackInteractionPayload } from '@/lib/slack/interaction-payload';

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

/**
 * Resolves a Slack user ID to the internal memberId.
 * Queries the SlackIdentityLink repository (backed by DB in production).
 * Returns null if no identity link exists.
 */
async function resolveMemberId(slackUserId: string): Promise<string | null> {
  const link = await repos.slackIdentityLink.findBySlackUserId(slackUserId);
  return link?.memberId ?? null;
}

/**
 * Finds the current open session for a member's team.
 * Returns null if no open session or member not found.
 */
async function findOpenSessionForMember(memberId: string): Promise<string | null> {
  const member = await repos.teamMember.findById(memberId);
  if (!member) return null;

  const session = await repos.session.findOpenByTeamId(member.teamId);
  return session?.id ?? null;
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

  // Process block_actions (button clicks for score submission)
  if (payload.type === 'block_actions') {
    const replyText = await processScoreActions(payload);
    await reply(payload.responseUrl, replyText);
  }

  // Return 200 to acknowledge (Slack requires response within 3 seconds)
  return new Response(null, { status: 200 });
});

/**
 * The dependencies `applyScoreActions` needs, drawn from the production
 * container.
 *
 * Named here rather than reached for inside the work itself, so the same
 * processing can be replayed by a scheduler tick against whatever that process
 * has — which is what acknowledging before processing requires.
 */
function productionScoreActionDeps() {
  return {
    findMemberBySlackUserId: resolveMemberId,
    findOpenSessionForMember,
    questionTitle: async (questionId: string): Promise<string> => {
      const question = await repos.question.findById(questionId);
      return question?.title ?? questionId;
    },
    upsertResponse: async (params: {
      memberId: string;
      sessionId: string;
      questionId: string;
      score: number;
    }): Promise<void> => {
      await container.response.upsert(params);
    },
  };
}

/** Processes the payload's score actions and returns the member-visible reply. */
async function processScoreActions(
  payload: SlackInteractionPayload,
): Promise<string | null> {
  return applyScoreActions(productionScoreActionDeps(), {
    slackUserId: payload.user?.id,
    actions: payload.actions,
  });
}

/**
 * Delivers the reply, if there is one and Slack gave us somewhere to send it.
 * A failed reply must never break the acknowledgement Slack is waiting for.
 */
async function reply(responseUrl: string | undefined, text: string | null): Promise<void> {
  if (!responseUrl || !text) return;

  try {
    await getResponder().respond(responseUrl, text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Slack interaction reply failed: ${message}`);
  }
}
