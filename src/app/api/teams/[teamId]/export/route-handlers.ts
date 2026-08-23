import type { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import type { AuthContext } from '@/lib/auth/with-auth';

type DateRange = { from: Date; to: Date };
type GetAuthContext = (request: NextRequest) => Promise<AuthContext | null>;
type AuthorizeTeamMember = (memberId: string, teamId: string) => Promise<void>;
type ExportCSV = (teamId: string, dateRange?: DateRange) => Promise<string>;

interface TeamExportRouteHandlerDeps {
  getAuthContext: GetAuthContext;
  authorizeTeamMember: AuthorizeTeamMember;
  exportCSV: ExportCSV;
}

function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );
}

/** Factory for the cookie-authenticated, team-scoped CSV export handler. */
export function createTeamExportRouteHandler(deps: TeamExportRouteHandlerDeps) {
  return withErrorHandling(async (request, context) => {
    const auth = await deps.getAuthContext(request as NextRequest);
    if (!auth) return unauthorizedResponse();

    const { teamId } = await context!.params;
    await deps.authorizeTeamMember(auth.memberId, teamId);

    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const dateRange = fromParam && toParam
      ? { from: new Date(fromParam), to: new Date(toParam) }
      : undefined;
    const csv = await deps.exportCSV(teamId, dateRange);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="team-${teamId}-trends.csv"`,
      },
    });
  });
}
