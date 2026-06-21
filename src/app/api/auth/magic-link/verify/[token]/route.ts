/**
 * GET /api/auth/magic-link/verify/[token] — Verify a magic link token
 *
 * Requirements: 7.2, 7.4, 7.9
 * - Atomic CAS claim (single-use token)
 * - Returns authenticated state or genesis state for new users
 * - Expired/used tokens return 404 via NotFoundError from service
 * - Thin route handler: extract param, call service, return result
 */

import { withErrorHandling } from '@/lib/api-utils';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

/** Exposed for tests to seed data into the in-memory repos */
export const _testContainer = { _repos: repos };

export const GET = withErrorHandling(async (request, context) => {
  const { token } = await context!.params;

  const result = await container.auth.verifyMagicLink(token);

  return Response.json(result);
});
