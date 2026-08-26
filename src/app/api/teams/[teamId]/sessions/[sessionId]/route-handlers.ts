import type { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import type { AuthContext } from '@/lib/auth/with-auth';
import type { HealthCheckSession } from '@/lib/repositories/entities';

type GetAuthContext = (request: NextRequest) => Promise<AuthContext | null>;
type AuthorizeTeamMember = (memberId: string, teamId: string) => Promise<void>;
type GetSession = (
  expectedTeamId: string,
  sessionId: string,
) => Promise<HealthCheckSession>;

interface SessionDetailRouteHandlerDeps {
  getAuthContext: GetAuthContext;
  authorizeTeamMember: AuthorizeTeamMember;
  getSession: GetSession;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );
}

/** Factory for the cookie-authenticated, team-scoped session-detail handler. */
export function createSessionDetailRouteHandler(deps: SessionDetailRouteHandlerDeps) {
  return withErrorHandling(async (request, context) => {
    const auth = await deps.getAuthContext(request as NextRequest);
    if (!auth) return unauthorizedResponse();

    const { teamId, sessionId } = await context!.params;
    await deps.authorizeTeamMember(auth.memberId, teamId);

    const session = await deps.getSession(teamId, sessionId);
    return Response.json(session);
  });
}
