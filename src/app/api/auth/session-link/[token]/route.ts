/**
 * GET /api/auth/session-link/[token] — Validate session link and return member/session context
 *
 * Requirements: 6.3, 6.4, 6.7
 * Thin route handler: extract token, apply rate limiting via AuthService, return context or 404.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

export const GET = withErrorHandling(async (request, context) => {
  const { token } = await context!.params;

  // Get IP for rate limiting
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  // Validate with rate limiting
  const result = await container.auth.validateSessionLinkWithRateLimit(token, ip);

  if (!result) {
    throw new NotFoundError('Invalid or expired session link');
  }

  return Response.json(result);
});
