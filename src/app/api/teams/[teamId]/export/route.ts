/**
 * GET /api/teams/[teamId]/export — Download trend data as CSV
 *
 * Requirements: 8.9, 20.6
 * Thin route handler: call service, return CSV with correct Content-Type.
 * Privacy mode enforcement: anonymous mode CSV contains only aggregated data (enforced by service).
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
 * GET — Export team trend data as a CSV file.
 * Requirement 8.9: CSV export with trend data.
 * Optional query params `from` and `to` for date range filtering (ISO 8601).
 * Privacy mode enforced: service-level suppression of individual data in anonymous mode.
 */
export const GET = withErrorHandling(async (request, context) => {
  const { teamId } = await context!.params;
  const url = new URL(request.url);

  // Parse optional date range from query params
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  let dateRange: { from: Date; to: Date } | undefined;
  if (fromParam && toParam) {
    dateRange = {
      from: new Date(fromParam),
      to: new Date(toParam),
    };
  }

  const csv = await container.trend.exportCSV(teamId, dateRange);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="team-${teamId}-trends.csv"`,
    },
  });
});
