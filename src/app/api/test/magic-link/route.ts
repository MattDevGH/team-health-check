/**
 * GET /api/test/magic-link?email=... — test-only magic-link retrieval
 *
 * Lets the E2E suite complete a real sign-in without an inbox. Returns the most
 * recent token captured for the address in this process.
 *
 * SECURITY: hands out live authentication tokens. Returns 404 unless TEST_MODE
 * is exactly "true", and never set TEST_MODE in a deployed environment.
 *
 * A missing capture is answered with an explicit 404 rather than an empty
 * success, so a caller cannot mistake "no token" for "nothing to test" and skip.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import { isTestMode, latestCapturedToken } from '@/lib/test-mode/email-capture';

/** Indistinguishable from a route that does not exist. */
function notFound(message?: string): Response {
  if (!message) return new Response(null, { status: 404 });

  return Response.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  if (!isTestMode()) {
    return notFound();
  }

  const email = new URL(request.url).searchParams.get('email');
  if (!email) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'email query parameter is required' } },
      { status: 400 },
    );
  }

  const token = latestCapturedToken(email);
  if (!token) {
    return notFound(`No magic link has been captured for ${email} in this process`);
  }

  return Response.json({ token });
}
