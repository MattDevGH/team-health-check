/**
 * POST /api/slack/commands — Slack slash command handler
 *
 * Handles:
 * - `/healthcheck signin` — hands back a single-use sign-in link (Slack Sign In 1.1)
 * - `/healthcheck connect` — generates a pairing code for Slack identity linking (Req 2.2)
 * - `/healthcheck` — responds with prompts for current session based on cadence (Req 5.15, 7.4)
 * - No active session — returns informative ephemeral message (Req 5.16, 7.4)
 * - Unlinked user — returns pairing instructions (Req 7.4)
 *
 * Architecture: Verify signature, parse form data, route by command text.
 * Thin route handler: no business logic — delegates to services/repos.
 *
 * Requirements: 2.2, 5.14, 5.15, 5.16, 7.4; Slack Sign In 1.1, 1.3, 1.5, 1.6
 */

import { withErrorHandling } from '@/lib/api-utils';
import { verifySlackSignature } from '@/lib/slack/verify-signature';
import { buildPromptMessage } from '@/lib/slack/message-builder';
import { container as prodContainer } from '@/lib/container-production';
import type { Container } from '@/lib/container';

/** Test seam: allows tests to inject a container with pre-populated data */
let _containerOverride: Container | null = null;

export function _setContainer(c: Container): void {
  _containerOverride = c;
}

function getContainer(): Container {
  return _containerOverride ?? prodContainer;
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

    if (text.trim() === 'signin') {
      return handleSignIn(slackUserId);
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
 * Handle `/healthcheck signin` — hand back a single-use sign-in link.
 *
 * Requirements: Slack Sign In 1.1, 1.3, 1.5
 *
 * Email was the only way in, and without a verified sending domain it reaches
 * the account owner and nobody else — silently, because the magic-link route
 * deliberately says nothing about which addresses exist. A colleague waits for
 * ever. This request arrives with a verified Slack signature instead.
 *
 * Ephemeral, because the reply carries a credential. A sign-in link in a
 * channel is a sign-in link for everyone in the channel.
 */
async function handleSignIn(slackUserId: string): Promise<Response> {
  const result = await getContainer().auth.requestSlackSignIn(slackUserId);

  if (result.status === 'unlinked') {
    /*
     * The same reply for a workspace member on no team and one whose account
     * is merely unlinked. Telling them apart would make this command a way of
     * asking who is on a team.
     */
    return ephemeral(
      'Your Slack account is not linked to a Team Health Check member, so there is ' +
        'nothing to sign you in to.\nUse `/healthcheck connect` to get a pairing code, ' +
        'or ask your delivery manager to link your account.',
    );
  }

  if (result.status === 'rate_limited') {
    /*
     * A horizon, because a refusal without one is indistinguishable from a
     * broken command — somebody retries, is refused again, and concludes the
     * feature does not work.
     */
    return ephemeral(
      `You have asked for a sign-in link several times just now. ${describeWait(
        result.retryAfterMs,
      )}`,
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  return ephemeral(
    `Here is your sign-in link: ${baseUrl}/auth/magic/${result.token}\n` +
      'It works once, and only for you.',
  );
}

/**
 * Handle `/healthcheck` — show the health check prompt for the current session.
 * Requirement 7.4: the member is identified through the SlackIdentityLink.
 * Requirement 5.15: prompts reflect cadence preference and outstanding questions.
 * Requirement 5.16: no active session returns an informative message.
 */
async function handleHealthCheck(slackUserId: string): Promise<Response> {
  const result = await getContainer().healthCheckPrompt.resolveOnDemandPrompt(slackUserId);

  switch (result.kind) {
    case 'unlinked':
      return ephemeral(
        'Your Slack account is not linked to a Team Health Check member.\nUse `/healthcheck connect` to generate a pairing code and link your account.',
      );

    case 'no_active_session':
      return ephemeral(
        'No active health check session for your team. Check back when one is open!',
      );

    case 'all_answered':
      return ephemeral(
        `You have already answered every question in this health check session. Review or update your responses: ${result.sessionLinkUrl}`,
      );

    case 'prompt': {
      const message = buildPromptMessage({
        questions: result.questions,
        sessionLinkUrl: result.sessionLinkUrl,
        note: buildAwayNote(result.awayUntil),
      });

      return Response.json({
        response_type: 'ephemeral',
        text: 'Your health check session is open — rate the questions below or submit via browser.',
        blocks: message.blocks,
      });
    }
  }
}

/** How long to wait, in words rather than milliseconds. */
function describeWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'Try again in a minute.';
  if (minutes < 60) return `Try again in about ${minutes} minutes.`;

  const hours = Math.round(minutes / 60);
  return `Try again in about ${hours === 1 ? 'an hour' : `${hours} hours`}.`;
}

/** Ephemeral text-only Slack response. */
function ephemeral(text: string): Response {
  return Response.json({ response_type: 'ephemeral', text });
}

/**
 * Members who marked themselves away can still respond on demand; they are only
 * excluded from bot-initiated prompts, so the away state is advisory here.
 */
function buildAwayNote(awayUntil: Date | null): string | undefined {
  if (!awayUntil) return undefined;

  const until = awayUntil.toISOString().split('T')[0];
  return `You are marked away until ${until}, so you will not be prompted automatically. Responding here still counts.`;
}
