/**
 * POST /api/slack/commands — Slack slash command handler
 *
 * Handles:
 * - `/healthcheck connect` — generates a pairing code for Slack identity linking (Req 2.2)
 * - `/healthcheck` — responds with prompts for current session based on cadence (Req 5.15)
 * - No active session — returns informative ephemeral message (Req 5.16)
 *
 * Architecture: Verify signature, parse form data, route by command text.
 * Thin route handler: no business logic — delegates to services.
 *
 * Requirements: 2.2, 5.14, 5.15, 5.16
 */

import { withErrorHandling } from '@/lib/api-utils';
import { verifySlackSignature } from '@/lib/slack/verify-signature';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';
import type { Container } from '@/lib/container';

// Default container — uses in-memory repos until production wiring (task 27.1)
const repos = createInMemoryRepositories();
let container: Container = createContainer(repos);

/** Test seam: allows tests to inject a container with pre-populated data */
export function _setContainer(c: Container): void {
  container = c;
}

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  verifySlackSignature({ signature, timestamp, body });

  // Slack sends slash commands as form-encoded
  const params = new URLSearchParams(body);
  const command = params.get('command') ?? '';
  const text = params.get('text') ?? '';
  const slackUserId = params.get('user_id') ?? '';

  if (command === '/healthcheck') {
    if (text.trim() === 'connect') {
      return handleConnect(slackUserId);
    }

    // Default: show health check prompt
    return handleHealthCheck(slackUserId);
  }

  return Response.json({
    response_type: 'ephemeral',
    text: 'Unknown command.',
  });
});

/**
 * Handle `/healthcheck connect` — generate a pairing code.
 * Requirement 2.2: self-service command initiates identity linking.
 */
async function handleConnect(slackUserId: string): Promise<Response> {
  const code = await container.auth.generatePairingCode(slackUserId);

  return Response.json({
    response_type: 'ephemeral',
    text: `Your pairing code is: ${code}\nEnter it in the web interface to link your account. Valid for 10 minutes.`,
  });
}

/**
 * Handle `/healthcheck` — show health check prompt for current session.
 * Requirement 5.15: on-demand slash command responds with appropriate prompts.
 * Requirement 5.16: no active session returns informative message.
 *
 * TODO: When SlackIdentityLink repository is available, look up member
 * by Slack user ID, find their team, get active session, and build prompt
 * based on cadence preference and unanswered questions.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleHealthCheck(slackUserId: string): Promise<Response> {
  // TODO: Look up member by Slack ID via SlackIdentityLink repository
  // TODO: Get active session for member's team
  // TODO: Build prompt based on cadence preference and unanswered questions
  // For now, return the no-active-session message as a graceful default
  return Response.json({
    response_type: 'ephemeral',
    text: 'No active health check session for your team. Check back when one is open!',
  });
}
