import type { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import type { AuthContext } from '@/lib/auth/with-auth';
import { ValidationError } from '@/lib/errors';
import type { TeamService } from '@/lib/services/team.service';
import { createTeamSchema } from '@/lib/validation/schemas';

type GetAuthContext = (request: NextRequest) => Promise<AuthContext | null>;
type TeamCollectionService = Pick<TeamService, 'create' | 'listTeams'>;

interface TeamRouteHandlerDeps {
  getAuthContext: GetAuthContext;
  teamService: TeamCollectionService;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );
}

/** Factory for cookie-authenticated team collection route handlers. */
export function createTeamRouteHandlers(deps: TeamRouteHandlerDeps) {
  const POST = withErrorHandling(async (request: Request) => {
    const auth = await deps.getAuthContext(request as NextRequest);
    if (!auth) return unauthorizedResponse();

    const parsed = createTeamSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || undefined,
          message: issue.message,
          code: issue.code,
        })),
      );
    }

    const team = await deps.teamService.create(
      parsed.data.name,
      parsed.data.description,
      auth.memberId,
    );
    return Response.json(team, { status: 201 });
  });

  const GET = withErrorHandling(async (request: Request) => {
    const auth = await deps.getAuthContext(request as NextRequest);
    if (!auth) return unauthorizedResponse();

    const teams = await deps.teamService.listTeams(auth.memberId);
    return Response.json(teams);
  });

  return { GET, POST };
}
