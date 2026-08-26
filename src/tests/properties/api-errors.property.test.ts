import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ValidationError,
  NotFoundError,
  AppError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from '@/lib/errors';
import type { ValidationField } from '@/lib/errors';
import { withErrorHandling, type ApiErrorResponse } from '@/lib/api-utils';

/**
 * Property 27: API error response format consistency
 *
 * *For any* API request with invalid or missing required fields, the response SHALL
 * be HTTP 400 with a JSON body containing a top-level "errors" array.
 * *For any* request referencing a non-existent resource, the response SHALL be
 * HTTP 404 with a JSON error message.
 * All API responses SHALL have Content-Type: application/json.
 *
 * Validates: Requirements 20.2, 20.3, 20.4
 */

// --- Arbitraries ---

/** Generates arbitrary ValidationField entries. */
const validationFieldArb: fc.Arbitrary<ValidationField> = fc.record({
  field: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  code: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Generates a non-empty array of ValidationField entries. */
const validationFieldsArb: fc.Arbitrary<ValidationField[]> = fc.array(validationFieldArb, {
  minLength: 1,
  maxLength: 10,
});

/** Generates arbitrary non-empty error messages. */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

// --- Helpers ---

/** Creates a minimal Request object for testing route handlers. */
function makeRequest(): Request {
  return new Request('http://localhost/api/test', { method: 'GET' });
}

/** Extracts the JSON body from a Response. */
async function extractBody(response: Response): Promise<ApiErrorResponse> {
  const text = await response.text();
  return JSON.parse(text) as ApiErrorResponse;
}

describe('Property 27: API error response format consistency', () => {
  /**
   * Validates: Requirement 20.2
   * WHEN an API request contains invalid or missing required fields, THE Web_Interface
   * SHALL return an HTTP 400 response with a JSON body containing a top-level "errors"
   * array where each entry identifies the field name and a human-readable reason.
   */
  describe('ValidationError produces HTTP 400 with errors array', () => {
    it('any ValidationError with arbitrary fields produces status 400 and an errors array', () => {
      fc.assert(
        fc.asyncProperty(validationFieldsArb, errorMessageArb, async (fields, message) => {
          const handler = withErrorHandling(async () => {
            throw new ValidationError(fields, message);
          });

          const response = await handler(makeRequest());
          const body = await extractBody(response);

          // Status MUST be 400
          expect(response.status).toBe(400);

          // Body MUST have error.errors array
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toBe(message);
          expect(Array.isArray(body.error.errors)).toBe(true);
          expect(body.error.errors).toHaveLength(fields.length);

          // Each error entry must contain the field info
          body.error.errors!.forEach((entry: ValidationField, idx: number) => {
            expect(entry.message).toBe(fields[idx].message);
            expect(entry.code).toBe(fields[idx].code);
            if (fields[idx].field !== undefined) {
              expect(entry.field).toBe(fields[idx].field);
            }
          });
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Validates: Requirement 20.3
   * WHEN an API request references a resource that does not exist, THE Web_Interface
   * SHALL return an HTTP 404 response with a JSON body containing an error message.
   */
  describe('NotFoundError produces HTTP 404 with JSON error', () => {
    it('any NotFoundError produces status 404 with consistent error structure', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (message) => {
          const handler = withErrorHandling(async () => {
            throw new NotFoundError(message);
          });

          const response = await handler(makeRequest());
          const body = await extractBody(response);

          // Status MUST be 404
          expect(response.status).toBe(404);

          // Body MUST have error object with code and message
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('NOT_FOUND');
          expect(body.error.message).toBe(message);

          // NotFoundError should NOT have an errors array
          expect(body.error.errors).toBeUndefined();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Validates: Requirement 20.4
   * THE Web_Interface SHALL return all API responses as JSON with Content-Type
   * set to application/json.
   */
  describe('All error responses have Content-Type: application/json', () => {
    /** Generates arbitrary AppError subclasses with their expected status codes. */
    const appErrorArb = fc.oneof(
      validationFieldsArb.map(
        (fields) => new ValidationError(fields) as AppError
      ),
      errorMessageArb.map((msg) => new NotFoundError(msg) as AppError),
      errorMessageArb.map((msg) => new ForbiddenError(msg) as AppError),
      errorMessageArb.map((msg) => new ConflictError(msg) as AppError),
      errorMessageArb.map((msg) => new RateLimitError(msg) as AppError),
    );

    it('every typed error produces a response with application/json content type', () => {
      fc.assert(
        fc.asyncProperty(appErrorArb, async (error) => {
          const handler = withErrorHandling(async () => {
            throw error;
          });

          const response = await handler(makeRequest());

          // Content-Type MUST be application/json
          const contentType = response.headers.get('content-type');
          expect(contentType).toContain('application/json');

          // Status MUST match the error's statusCode
          expect(response.status).toBe(error.statusCode);

          // Body MUST be parseable JSON with error structure
          const body = await extractBody(response);
          expect(body.error).toBeDefined();
          expect(typeof body.error.code).toBe('string');
          expect(typeof body.error.message).toBe('string');
        }),
        { numRuns: 100 }
      );
    });

    it('unexpected errors produce 500 with application/json and no internal details', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (message) => {
          const handler = withErrorHandling(async () => {
            throw new Error(message);
          });

          const response = await handler(makeRequest());

          // Status MUST be 500
          expect(response.status).toBe(500);

          // Content-Type MUST be application/json
          const contentType = response.headers.get('content-type');
          expect(contentType).toContain('application/json');

          // Body MUST NOT expose the internal error message
          const body = await extractBody(response);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('INTERNAL_ERROR');
          // The response uses a static generic message, never the thrown message
          expect(body.error.message).toBe('An unexpected error occurred');
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Validates: Requirements 20.2, 20.3, 20.4
   * All error types map to their correct HTTP status codes consistently.
   */
  describe('Error type to HTTP status code mapping is deterministic', () => {
    it('ValidationError always maps to 400', () => {
      fc.assert(
        fc.asyncProperty(validationFieldsArb, async (fields) => {
          const handler = withErrorHandling(async () => {
            throw new ValidationError(fields);
          });
          const response = await handler(makeRequest());
          expect(response.status).toBe(400);
        }),
        { numRuns: 30 }
      );
    });

    it('NotFoundError always maps to 404', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (msg) => {
          const handler = withErrorHandling(async () => {
            throw new NotFoundError(msg);
          });
          const response = await handler(makeRequest());
          expect(response.status).toBe(404);
        }),
        { numRuns: 30 }
      );
    });

    it('ForbiddenError always maps to 403', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (msg) => {
          const handler = withErrorHandling(async () => {
            throw new ForbiddenError(msg);
          });
          const response = await handler(makeRequest());
          expect(response.status).toBe(403);
        }),
        { numRuns: 30 }
      );
    });

    it('ConflictError always maps to 409', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (msg) => {
          const handler = withErrorHandling(async () => {
            throw new ConflictError(msg);
          });
          const response = await handler(makeRequest());
          expect(response.status).toBe(409);
        }),
        { numRuns: 30 }
      );
    });

    it('RateLimitError always maps to 429', () => {
      fc.assert(
        fc.asyncProperty(errorMessageArb, async (msg) => {
          const handler = withErrorHandling(async () => {
            throw new RateLimitError(msg);
          });
          const response = await handler(makeRequest());
          expect(response.status).toBe(429);
        }),
        { numRuns: 30 }
      );
    });
  });
});
