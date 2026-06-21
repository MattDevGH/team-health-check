/**
 * POST /api/auth/slack-pairing — Verify Slack pairing code
 *
 * Accepts a pairing code + memberId, verifies via AuthService.
 * Returns { linked: true, slackUserId } on success.
 *
 * Requirements: 2.4, 2.5
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
export const container = createContainer(repos);

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json();

  if (!body.code || typeof body.code !== 'string') {
    throw new ValidationError([{ field: 'code', message: 'Pairing code is required', code: 'REQUIRED' }]);
  }
  if (!body.memberId || typeof body.memberId !== 'string') {
    throw new ValidationError([{ field: 'memberId', message: 'Member ID is required', code: 'REQUIRED' }]);
  }

  const result = await container.auth.verifyPairingCode(body.memberId, body.code);

  if (!result) {
    throw new NotFoundError('Invalid, expired, or already used pairing code');
  }

  return Response.json({ linked: true, slackUserId: result.slackUserId });
});
