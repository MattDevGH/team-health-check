/**
 * POST /api/teams/genesis — create team from magic link (genesis flow).
 * Requirement 7.9: Unknown email creates new team with delivery_manager role.
 *
 * Thin route handler: validates input, delegates to genesis service.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { buildSetCookieHeader } from '@/lib/auth/session-cookie';
import { container } from '@/lib/container-production';
import { ValidationError } from '@/lib/errors';
import { genesisSchema } from '@/lib/validation/schemas';

export const POST = withErrorHandling(async (request: Request) => {
  const body: unknown = await request.json();
  const parsed = genesisSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })));
  }

  const result = await container.genesis.executeGenesis(parsed.data);
  const response = Response.json(result, { status: 201 });
  response.headers.set('Set-Cookie', buildSetCookieHeader(result.sessionToken));
  return response;
});
