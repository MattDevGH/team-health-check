import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
} from './errors';

describe('AppError', () => {
  it('extends Error with code and statusCode', () => {
    const error = new AppError('Something went wrong', 'INTERNAL_ERROR', 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('AppError');
  });
});

describe('ValidationError', () => {
  it('has statusCode 400 and code VALIDATION_ERROR', () => {
    const fields = [
      { field: 'name', message: 'Name is required', code: 'REQUIRED' },
    ];
    const error = new ValidationError(fields);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
  });

  it('stores the fields array', () => {
    const fields = [
      { field: 'email', message: 'Invalid email', code: 'INVALID_EMAIL' },
      { message: 'Something else failed', code: 'GENERIC' },
    ];
    const error = new ValidationError(fields);
    expect(error.fields).toEqual(fields);
    expect(error.fields).toHaveLength(2);
    expect(error.fields[1].field).toBeUndefined();
  });

  it('accepts a custom message', () => {
    const error = new ValidationError(
      [{ message: 'bad input', code: 'BAD' }],
      'Custom validation message'
    );
    expect(error.message).toBe('Custom validation message');
  });

  it('has a default message when none provided', () => {
    const error = new ValidationError([{ message: 'bad', code: 'BAD' }]);
    expect(error.message).toBe('Validation failed');
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404 and code NOT_FOUND', () => {
    const error = new NotFoundError('Team not found');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('Team not found');
  });

  it('has a default message when none provided', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403 and code FORBIDDEN', () => {
    const error = new ForbiddenError('Insufficient permissions');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.name).toBe('ForbiddenError');
    expect(error.message).toBe('Insufficient permissions');
  });

  it('has a default message when none provided', () => {
    const error = new ForbiddenError();
    expect(error.message).toBe('Forbidden');
  });
});

describe('ConflictError', () => {
  it('has statusCode 409 and code CONFLICT', () => {
    const error = new ConflictError('Member already exists');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.name).toBe('ConflictError');
    expect(error.message).toBe('Member already exists');
  });

  it('has a default message when none provided', () => {
    const error = new ConflictError();
    expect(error.message).toBe('Resource conflict');
  });
});

describe('RateLimitError', () => {
  it('has statusCode 429 and code RATE_LIMIT_EXCEEDED', () => {
    const error = new RateLimitError('Too many requests');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.name).toBe('RateLimitError');
    expect(error.message).toBe('Too many requests');
  });

  it('has a default message when none provided', () => {
    const error = new RateLimitError();
    expect(error.message).toBe('Rate limit exceeded');
  });
});
