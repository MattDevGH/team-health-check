/**
 * POST /api/slack/commands — Slack slash command handler
 *
 * Handles:
 * - `/healthcheck connect` — generates a pairing code for Slack identity linking (Req 2.2)
 * - `/healthcheck` — responds with prompts for current session based on cadence (Req 5.15, 7.4)
 * - No active session — returns informative ephemeral message (Req 5.16, 7.4)
 * - Unlinked user — returns pairing instructions (Req 7.4)
 *
 * Architecture: Verify signature, parse form data, route by command text.
 * Thin route handler: no business logic — delegates to services/repos.
 *
 * Requirements: 2.2, 5.14, 5.15, 5.16, 7.4
 */

import { withErrorHandling } from '@/lib/api-utils';
import { verifySlackSignature } from '@/lib/slack/verify-signature';
import { container as prodContainer } from '@/lib/container-production';
import { repos as prodRepos } from '@/lib/container-production';
import type { Container } from '@/lib/container';
import type { Repositories } from '@/lib/repositories';

/** Test seam: allows tests to inject a container with pre-populated data */
let _containerOverride: Container | null = null;
let _reposOverride: Repositories | null = null;

export function _setContainer(c: Container): void {
  _containerOverride = c;
}

export function _setRepos(r: Repositories): void {
  _reposOverride = r;
}

function getContainer(): Container {
  return _containerOverride ?? prodContainer;
}

function getRepos(): Repositories {
  return _reposOverride ?? prodRepos;
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
  const c = getContainer();
  const code = await c.auth.generatePairingCode(slackUserId);

  return Response.json({
    response_type: 'ephemeral',
    text: `Your pairing code is: ${code}\nEnter it in the web interface to link your account. Valid for 10 minutes.`,
  });
}

/**
 * Handle `/healthcheck` — show health check prompt for current session.
 * Requirement 7.4: Use SlackIdentityLinkRepository to identify the member.
 * Requirement 5.15: on-demand slash command responds with appropriate prompts.
 * Requirement 5.16: no active session returns informative message.
 */
async function handleHealthCheck(slackUserId: string): Promise<Response> {
  const r = getRepos();

  // Step 1: Look up Slack identity link
  const link = await r.slackIdentityLink.findBySlackUserId(slackUserId);

  if (!link) {
    // Unlinked user — return pairing instructions
    return Response.json({
      response_type: 'ephemeral',
      text: 'Your Slack account is not linked to a Team Health Check member.\nUse `/healthcheck connect` to generate a pairing code and link your account.',
    });
  }

  // Step 2: Look up the member to find their team
  const member = await r.teamMember.findById(link.memberId);
  if (!member) {
    // Member no longer exists — treat as unlinked
    return Response.json({
      response_type: 'ephemeral',
      text: 'Your Slack account is not linked to a Team Health Check member.\nUse `/healthcheck connect` to generate a pairing code and link your account.',
    });
  }

  // Step 3: Find open session for the member's team
  const openSession = await r.session.findOpenByTeamId(member.teamId);

  if (!openSession) {
    return Response.json({
      response_type: 'ephemeral',
      text: 'No active health check session for your team. Check back when one is open!',
    });
  }

  // Step 4: Return health check prompt with session info
  return Response.json({
    response_type: 'ephemeral',
    text: `You have an active health check session open for your team. Submit your responses to share how things are going!\nSession started: ${openSession.actualOpenAt.toISOString().split('T')[0]}`,
  });
}
