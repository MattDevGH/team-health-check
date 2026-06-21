/**
 * GET /api/teams/[teamId]/trends — Get trend data (session averages) for a team
 *
 * Requirements: 8.1, 20.6
 * Thin route handler: call service, enforce privacy mode, format response.
 * Privacy mode enforcement: anonymous mode suppresses individual data at the service layer.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

// Exported for test access to seed data
export { repos as _testRepos };

/**
 * GET — Return session averages for the team.
 * Requirement 8.1: Trend data with averages.
 * Optional query param `questionId` filters to a specific question.
 * Privacy mode enforced: anonymous mode suppresses data below anonymity threshold.
 */
export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const url = new URL(request.url);
  const questionId = url.searchParams.get('questionId') ?? undefined;

  // Privacy mode is enforced within the trend service (suppresses sub-threshold data)
  const averages = await container.trend.getSessionAverages(teamId, questionId);

  // Get privacy mode for response metadata
  const privacyMode = await container.privacy.getMode(teamId);

  return Response.json({
    teamId,
    privacyMode,
    data: averages,
  });
});
