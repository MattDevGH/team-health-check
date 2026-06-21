/**
 * DELETE /api/me/slack-link — Unlink Slack identity
 *
 * Requirements: 2.6
 * Thin route handler: placeholder for Slack identity unlinking.
 * Full implementation pending Slack integration completion.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';

export const DELETE = withErrorHandling(async (request: Request) => {
  const memberId = request.headers.get('x-member-id');
  if (!memberId) {
    throw new ValidationError([
      { field: 'x-member-id', message: 'Missing member ID header', code: 'MISSING_HEADER' },
    ]);
  }

  // Placeholder: Slack identity unlinking is not fully implemented yet.
  // When implemented, this will remove the SlackIdentityLink record for the member.
  return Response.json({ success: true, message: 'Slack identity unlinked' });
});
