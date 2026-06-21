import { describe, it, expect, beforeEach } from 'vitest';
import { resetRateLimitStore } from '@/lib/rate-limit';

// Requirements: 7.1, 7.5, 7.8, 7.9

describe('POST /api/auth/magic-link/request', () => {
  let POST: typeof import('./route').POST;

  beforeEach(async () => {
    resetRateLimitStore();
    // Dynamic import to reset module state per test
    const mod = await import('./route');
    POST = mod.POST;
  });

  it('returns 200 with generic message for valid email', async () => {
    const request = new Request('http://localhost/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.message).toBe('If this email is registered, a link has been sent.');
  });

  it('returns 200 for non-existent email (anti-enumeration)', async () => {
    const request = new Request('http://localhost/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.message).toBe('If this email is registered, a link has been sent.');
  });

  it('returns 400 when email is missing', async () => {
    const request = new Request('http://localhost/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.errors).toBeDefined();
    expect(body.error.errors[0].field).toBe('email');
  });

  it('returns 400 when email is not a string', async () => {
    const request = new Request('http://localhost/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 123 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when email is empty string', async () => {
    const request = new Request('http://localhost/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('always returns 200 even when rate-limited (anti-enumeration)', async () => {
    // The service silently handles rate limiting; route always returns 200
    const makeRequest = () =>
      new Request('http://localhost/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ratelimited@example.com' }),
      });

    // Make 6 requests (limit is 5 per hour)
    for (let i = 0; i < 6; i++) {
      const response = await POST(makeRequest());
      // Always 200 — anti-enumeration requirement 7.8
      expect(response.status).toBe(200);
    }
  });
});
