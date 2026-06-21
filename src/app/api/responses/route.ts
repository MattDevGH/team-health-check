/**
 * POST /api/responses — Submit health check responses
 *
 * Requirements: 4.4, 4.6, 16.1
 * Thin route handler: validate input, call service, format response.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { submitResponseSchema } from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// For now, use in-memory repos until production wiring is complete (task 27.1)
const repos = createInMemoryRepositories();
const container = createContainer(repos);

export { repos as _repos, container as _container };

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json();

  // Validate input with Zod
  const parsed = submitResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        field: i.path.join('.') || undefined,
        message: i.message,
        code: i.code,
      }))
    );
  }

  // Extract memberId and sessionId from auth context headers
  const memberId = request.headers.get('x-member-id') ?? '';
  const sessionId = request.headers.get('x-session-id') ?? '';

  const results = [];
  for (const item of parsed.data.responses) {
    // Upsert response — service handles all business validation
    // (session exists, session open, member exists, member belongs to team)
    const response = await container.response.upsert({
      memberId,
      sessionId,
      questionId: item.questionId,
      score: item.score,
      trendIndicator: item.trendIndicator,
    });

    // Get rolling average for this question (needs teamId from session)
    // The session lookup is already validated by upsert, so we can safely retrieve teamId
    const session = await repos.session.findById(sessionId);
    const teamId = session!.teamId;
    const rollingAverage = await container.response.getRollingAverage(teamId, item.questionId);

    results.push({ ...response, rollingAverage });
  }

  return Response.json({ responses: results });
});
