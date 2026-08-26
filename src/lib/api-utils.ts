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
export function withErrorHandling(handler: RouteHandler): RouteHandler {
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

      // Unexpected error — log internally but expose no details
      console.error('Unexpected error:', error);
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
