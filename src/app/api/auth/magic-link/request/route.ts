/**
 * POST /api/auth/magic-link/request — Request a magic link
 *
 * Requirements: 7.1, 7.5, 7.8, 7.9
 * - Always returns 200 regardless of email existence (anti-enumeration)
 * - Rate limiting handled internally by the auth service
 * - Thin route handler: validate input, call service, format response
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json();
  const email = body.email;

  if (!email || typeof email !== 'string' || email.trim() === '') {
    throw new ValidationError([
      { field: 'email', message: 'Email is required', code: 'REQUIRED' },
    ]);
  }

  await container.auth.requestMagicLink(email);

  // Always return 200 regardless of email existence (Requirement 7.8: anti-enumeration)
  return Response.json({
    message: 'If this email is registered, a link has been sent.',
  });
});
