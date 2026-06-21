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
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// Wired repos/container (in-memory for now; production wiring via task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

/**
 * In-memory Slack user ID → memberId mapping.
 * In production this would be backed by the SlackIdentityLink table via Prisma.
 * Exposed for test seeding.
 */
const slackIdentityStore = new Map<string, string>();

export { repos as _repos, container as _container, slackIdentityStore as _slackIdentityStore };

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
 * Returns null if no identity link exists.
 */
async function resolveMemberId(slackUserId: string): Promise<string | null> {
  return slackIdentityStore.get(slackUserId) ?? null;
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
      // In production, would send a follow-up via response_url explaining they need to link
      return new Response(null, { status: 200 });
    }

    // Find the member's current open session
    const sessionId = await findOpenSessionForMember(memberId);
    if (!sessionId) {
      // No open session — Req 5.9: session ended, reject submission gracefully
      // In production, would send follow-up via response_url informing session is closed
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
        // In production, would queue a follow-up error message via response_url
        continue;
      }
    }

    // Req 5.8: Confirmation would be sent via response_url in production
    // For MVP, the 200 ack serves as acknowledgement
  }

  // Return 200 to acknowledge (Slack requires response within 3 seconds)
  return new Response(null, { status: 200 });
});
