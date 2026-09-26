/**
 * POST /api/responses/finalise — mark this member's answers for a session final
 *
 * Requirements: 18.1, 18.2, 18.3
 *
 * A member could change an answer until the session closed, which left two
 * problems in one place: they had no way to tell that a second edit had saved,
 * and the rolling average was computed over rows that could still move, so
 * reading it, changing a score and reading it again gave the sum of everybody
 * else's answers.
 *
 * Saying "I have finished" solves both. Thin handler: validate, call the
 * service, format.
 */

import { NextRequest } from 'next/server';

import { z } from 'zod';

import { ValidationError, AppError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createGetAuthContext, createWithAuth } from '@/lib/auth/with-auth';
import type { AuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos, container as _container };

const finaliseSchema = z.object({ sessionId: z.string().min(1) });

const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });
const withAuth = createWithAuth({ getAuthContext });

export const POST = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, auth: AuthContext) => {
    try {
      const parsed = finaliseSchema.safeParse(await request.json());
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map(issue => ({
            field: issue.path.join('.') || undefined,
            message: issue.message,
            code: issue.code,
          })),
        );
      }

      /**
       * The member comes from the cookie, never the body. Accepting a memberId
       * here would let anyone finalise somebody else's answers, which is both
       * an edit to another person's data and a way to force their score into
       * the rolling average before they had finished thinking.
       */
      const result = await container.response.finalise({
        memberId: auth.memberId,
        sessionId: parsed.data.sessionId,
      });

      return Response.json({
        finalisedAt: result.finalisedAt.toISOString(),
        count: result.count,
      });
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
      console.error('Unexpected error in POST /api/responses/finalise:', error);
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 },
      );
    }
  },
);
