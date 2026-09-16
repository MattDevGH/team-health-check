/**
 * API utility functions for Next.js App Router route handlers.
 * Requirement 20.2: Consistent error response format
 * Requirement 20.3: Typed error → HTTP status mapping
 * Requirement 20.4: No internal details in 500 responses
 * Requirement 20.5: JSON Content-Type for all error responses
 */

import {
  AppError,
  ValidationError,
} from './errors';
import type { ValidationField } from './errors';
import { recorder, type Recorder } from '@/lib/observability';

/**
 * Structured API error response body.
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    errors?: ValidationField[];
  };
}

/**
 * Next.js App Router route handler signature.
 */
type RouteHandler = (
  request: Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * Higher-order function that wraps a Next.js route handler with
 * centralised error handling. Catches typed AppError subclasses
 * and maps them to structured JSON responses with appropriate
 * HTTP status codes.
 *
 * - ValidationError → 400 (includes field-level errors)
 * - ForbiddenError → 403
 * - NotFoundError → 404
 * - ConflictError → 409
 * - RateLimitError → 429
 * - Unexpected errors → 500 (generic message, no internal details)
 */
/** The path, or the raw URL if it cannot be parsed. Never throws. */
function safeRoute(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

export function withErrorHandling(
  handler: RouteHandler,
  /**
   * Injectable so a test can read what was recorded. Defaults to the
   * application's recorder, so a route gets this for free.
   */
  record: Recorder = recorder,
): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        return Response.json(
          {
            error: {
              code: error.code,
              message: error.message,
              errors: error.fields,
            },
          },
          { status: error.statusCode }
        );
      }

      if (error instanceof AppError) {
        return Response.json(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          { status: error.statusCode }
        );
      }

      /*
       * Unexpected, and therefore the only kind worth recording. A 404 or a
       * validation failure is the system working; recording those would bury
       * the ones that matter in the ones that do not.
       *
       * The route is the thing a reader needs and the thing the old line
       * lacked: `Unexpected error:` arrives in a serverless log with no request
       * beside it.
       */
      record.error('request.failed', {
        route: safeRoute(request),
        errorName: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500 }
      );
    }
  };
}
