/**
 * POST /api/responses — Submit health check responses
 *
 * Requirements: 2.5, 5.1, 5.2, 5.3, 5.4
 * Thin route handler: validate session cookie via withAuth,
 * read sessionId from body, call service, format response.
 */

import { NextRequest } from 'next/server';

import { submitResponseSchema } from '@/lib/validation/schemas';
import { ValidationError, AppError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext, createWithAuth } from '@/lib/auth/with-auth';
import type { AuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const withAuth = createWithAuth({ getAuthContext });

export const POST = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, auth: AuthContext) => {
    try {
      const body = await request.json();

      // Validate input with Zod (includes sessionId in body)
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

      const { sessionId, responses: submittedResponses } = parsed.data;
      const memberId = auth.memberId;

      const results = [];
      for (const item of submittedResponses) {
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
        const session = await repos.session.findById(sessionId);
        const teamId = session!.teamId;
        const rollingAverage = await container.response.getRollingAverage(teamId, item.questionId);

        results.push({
          questionId: response.questionId,
          score: response.score,
          trendIndicator: response.trendIndicator ?? null,
          rollingAverage,
        });
      }

      return Response.json({ responses: results });
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        return Response.json(
          { error: { code: error.code, message: error.message, errors: error.fields } },
          { status: error.statusCode },
        );
      }
      if (error instanceof AppError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.statusCode },
        );
      }
      console.error('Unexpected error in POST /api/responses:', error);
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 },
      );
    }
  },
);
