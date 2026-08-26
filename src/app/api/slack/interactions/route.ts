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
import {
  buildConfirmationText,
  buildScoreRejectionText,
  buildSessionEndedText,
  buildUnlinkedText,
  createInteractionResponder,
} from '@/lib/slack/interaction-response';
import type { InteractionResponder } from '@/lib/slack/interaction-response';

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
 * Slack interaction payload types for type safety.
 */
interface SlackAction {
  action_id?: string;
  block_id?: string;
  value?: string;
  type?: string;
}

interface SlackInteractionPayload {
  type: string;
  user?: { id: string; name?: string };
  actions?: SlackAction[];
  response_url?: string;
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

/**
 * Parses a score action value. Expected format: "questionId:score"
 * Returns null if the format or value is invalid.
 */
function parseScoreAction(value: string): { questionId: string; score: number } | null {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) return null;

  const questionId = value.substring(0, colonIndex);
  const scoreStr = value.substring(colonIndex + 1);
  const score = parseInt(scoreStr, 10);

  if (!questionId || isNaN(score)) return null;
  if (score < 1 || score > 5) return null;

  return { questionId, score };
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

  const payload: SlackInteractionPayload = JSON.parse(payloadStr);

  // Process block_actions (button clicks for score submission)
  if (payload.type === 'block_actions') {
    const replyText = await processScoreActions(payload);
    await reply(payload.response_url, replyText);
  }

  // Return 200 to acknowledge (Slack requires response within 3 seconds)
  return new Response(null, { status: 200 });
});

/**
 * Processes the payload's score actions and returns the member-visible reply.
 * Returns null when there is nothing to say (malformed payload, no score actions).
 */
async function processScoreActions(
  payload: SlackInteractionPayload,
): Promise<string | null> {
  const slackUserId = payload.user?.id;
  if (!slackUserId) {
    // Malformed payload — nobody to reply to
    return null;
  }

  const memberId = await resolveMemberId(slackUserId);
  if (!memberId) {
    return buildUnlinkedText();
  }

  const sessionId = await findOpenSessionForMember(memberId);
  if (!sessionId) {
    // Requirement 5.9: session ended, reject the submission and say so
    return buildSessionEndedText();
  }

  const lines: string[] = [];

  for (const action of payload.actions ?? []) {
    if (!action.action_id?.startsWith('score_') || !action.value) {
      continue;
    }

    const parsed = parseScoreAction(action.value);
    if (!parsed) {
      // Requirement 5.7: validation error naming the affected question
      lines.push(buildScoreRejectionText(await questionTitle(questionIdOf(action.value))));
      continue;
    }

    try {
      // Upsert response via the service (handles uniqueness, Req 5.10)
      await container.response.upsert({
        memberId,
        sessionId,
        questionId: parsed.questionId,
        score: parsed.score,
      });
      // Requirement 5.8: confirm the stored score
      lines.push(buildConfirmationText(await questionTitle(parsed.questionId), parsed.score));
    } catch {
      lines.push(buildScoreRejectionText(await questionTitle(parsed.questionId)));
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/** Extracts the question id from an unparsed action value ("questionId:score"). */
function questionIdOf(value: string): string {
  const colonIndex = value.indexOf(':');
  return colonIndex === -1 ? value : value.substring(0, colonIndex);
}

/** Resolves a question's display title, falling back to its id. */
async function questionTitle(questionId: string): Promise<string> {
  const question = await repos.question.findById(questionId);
  return question?.title ?? questionId;
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
