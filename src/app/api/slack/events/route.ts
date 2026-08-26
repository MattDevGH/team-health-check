/**
 * POST /api/slack/events
 *
 * Handles incoming Slack Events API requests.
 * - URL verification challenge (Slack sends during app setup)
 * - Event callbacks (app_mention, message, etc.)
 *
 * Requirement: 5.14
 */

import { withErrorHandling } from '@/lib/api-utils';
import { verifySlackSignature } from '@/lib/slack/verify-signature';

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const body = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  // Verify signature first — reject tampered/replayed requests
  verifySlackSignature({ signature, timestamp, body });

  const payload = JSON.parse(body);

  // URL verification challenge (Slack sends this during app setup)
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }

  // Event callback — acknowledge immediately, defer processing
  if (payload.type === 'event_callback') {
    // TODO: Route to appropriate handler based on payload.event.type
    // e.g. app_mention, message
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 200 });
});
