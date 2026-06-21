import { describe, it, expect, vi } from 'vitest';
import { withErrorHandling } from './api-utils';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from './errors';

// Requirement 20.2, 20.3, 20.4, 20.5

describe('withErrorHandling', () => {
  const mockRequest = new Request('http://localhost/api/test');

  it('passes through successful responses unchanged', async () => {
    const handler = vi.fn().mockResolvedValue(
      Response.json({ data: 'ok' }, { status: 200 })
    );

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: 'ok' });
  });

  it('maps ValidationError to 400 with fields in error body', async () => {
    const fields = [
      { field: 'name', message: 'Name is required', code: 'required' },
      { message: 'Invalid format', code: 'invalid_format' },
    ];
    const handler = vi.fn().mockRejectedValue(new ValidationError(fields));

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: fields,
      },
    });
  });

  it('maps ValidationError with custom message', async () => {
    const fields = [{ field: 'email', message: 'Invalid email', code: 'invalid_email' }];
    const handler = vi.fn().mockRejectedValue(
      new ValidationError(fields, 'Email validation failed')
    );

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email validation failed',
        errors: fields,
      },
    });
  });

  it('maps NotFoundError to 404', async () => {
    const handler = vi.fn().mockRejectedValue(new NotFoundError('Team not found'));

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Team not found',
      },
    });
  });

  it('maps ForbiddenError to 403', async () => {
    const handler = vi.fn().mockRejectedValue(new ForbiddenError('Access denied'));

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(403);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
      },
    });
  });

  it('maps ConflictError to 409', async () => {
    const handler = vi.fn().mockRejectedValue(new ConflictError('Member already exists'));

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(409);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Member already exists',
      },
    });
  });

  it('maps RateLimitError to 429', async () => {
    const handler = vi.fn().mockRejectedValue(new RateLimitError('Too many requests'));

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
      },
    });
  });

  it('maps unexpected errors to 500 with no internal details', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Database connection lost'));

    const wrapped = withErrorHandling(handler);
    // Suppress console.error noise in test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrapped(mockRequest);

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    // Should not leak internal error details
    expect(JSON.stringify(body)).not.toContain('Database connection lost');

    consoleSpy.mockRestore();
  });

  it('maps non-Error thrown values to 500 with no internal details', async () => {
    const handler = vi.fn().mockRejectedValue('string error');

    const wrapped = withErrorHandling(handler);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrapped(mockRequest);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });

    consoleSpy.mockRestore();
  });

  it('passes request and context to the wrapped handler', async () => {
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const context = { params: Promise.resolve({ teamId: 'abc123' }) };

    const wrapped = withErrorHandling(handler);
    await wrapped(mockRequest, context);

    expect(handler).toHaveBeenCalledWith(mockRequest, context);
  });

  it('uses default messages for errors with default constructor', async () => {
    const handler = vi.fn().mockRejectedValue(new NotFoundError());

    const wrapped = withErrorHandling(handler);
    const response = await wrapped(mockRequest);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  });
});
