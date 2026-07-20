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

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

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
    const slackUserId = payload.user?.id;
    if (!slackUserId) {
      // Ack without processing — malformed payload
      return new Response(null, { status: 200 });
    }

    // Resolve Slack user to internal memberId
    const memberId = await resolveMemberId(slackUserId);
    if (!memberId) {
      // User not linked — ack but cannot process (Req 5.9: inform user session ended)
      return new Response(null, { status: 200 });
    }

    // Find the member's current open session
    const sessionId = await findOpenSessionForMember(memberId);
    if (!sessionId) {
      // No open session — Req 5.9: session ended, reject submission gracefully
      return new Response(null, { status: 200 });
    }

    // Process each score action
    for (const action of payload.actions ?? []) {
      if (!action.action_id?.startsWith('score_') || !action.value) {
        continue;
      }

      const parsed = parseScoreAction(action.value);
      if (!parsed) {
        // Invalid score format or out of range (Req 5.7) — skip this action
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
      } catch {
        // Swallow errors per action — continue processing remaining actions
        continue;
      }
    }
  }

  // Return 200 to acknowledge (Slack requires response within 3 seconds)
  return new Response(null, { status: 200 });
});
