/**
 * Base application error class. All typed errors extend this.
 * Never throw raw strings — always use a typed error subclass.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ValidationField {
  field?: string;
  message: string;
  code: string;
}

/**
 * Thrown when request input fails validation.
 * Carries a `fields` array describing each validation failure.
 */
export class ValidationError extends AppError {
  readonly fields: ValidationField[];

  constructor(fields: ValidationField[], message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400);
    this.fields = fields;
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when the user lacks permission for the requested action.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Thrown when the request conflicts with existing state (e.g. duplicate).
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Thrown when the client has exceeded the allowed request rate.
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}
