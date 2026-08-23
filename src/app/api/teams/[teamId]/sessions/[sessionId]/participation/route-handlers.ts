import type { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import type { AuthContext } from '@/lib/auth/with-auth';
import type { ParticipationData } from '@/lib/services/participation.service';

type GetAuthContext = (request: NextRequest) => Promise<AuthContext | null>;
type AuthorizeTeamMember = (memberId: string, teamId: string) => Promise<void>;
type GetParticipation = (
  teamId: string,
  sessionId: string,
  requesterMemberId: string,
) => Promise<ParticipationData>;

interface ParticipationRouteHandlerDeps {
  getAuthContext: GetAuthContext;
  authorizeTeamMember: AuthorizeTeamMember;
  getParticipation: GetParticipation;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );
}

/** Creates the cookie-authenticated, team-bound participation handler. */
export function createParticipationRouteHandler(deps: ParticipationRouteHandlerDeps) {
  return withErrorHandling(async (request, context) => {
    const auth = await deps.getAuthContext(request as NextRequest);
    if (!auth) return unauthorizedResponse();

    const { teamId, sessionId } = await context!.params;
    await deps.authorizeTeamMember(auth.memberId, teamId);
    const participation = await deps.getParticipation(teamId, sessionId, auth.memberId);

    return Response.json(participation);
  });
}
