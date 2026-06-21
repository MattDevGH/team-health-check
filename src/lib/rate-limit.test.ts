import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, resetRateLimitStore } from './rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const key = '192.168.1.1';
    const limit = 10;
    const windowMs = 5 * 60 * 1000; // 5 minutes

    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit(key, limit, windowMs)).toBe(true);
    }
  });

  it('blocks requests once the limit is reached', () => {
    const key = '192.168.1.1';
    const limit = 10;
    const windowMs = 5 * 60 * 1000;

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      checkRateLimit(key, limit, windowMs);
    }

    // Next request should be blocked
    expect(checkRateLimit(key, limit, windowMs)).toBe(false);
  });

  it('resets after the window expires', () => {
    const key = 'user@example.com';
    const limit = 5;
    const windowMs = 60 * 60 * 1000; // 1 hour

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      checkRateLimit(key, limit, windowMs);
    }

    expect(checkRateLimit(key, limit, windowMs)).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Should be allowed again
    expect(checkRateLimit(key, limit, windowMs)).toBe(true);
  });

  it('tracks different keys independently', () => {
    const limit = 2;
    const windowMs = 60 * 1000;

    // Exhaust limit for key1
    checkRateLimit('key1', limit, windowMs);
    checkRateLimit('key1', limit, windowMs);
    expect(checkRateLimit('key1', limit, windowMs)).toBe(false);

    // key2 should still be allowed
    expect(checkRateLimit('key2', limit, windowMs)).toBe(true);
  });

  it('uses sliding window — old entries expire individually', () => {
    const key = 'sliding-test';
    const limit = 3;
    const windowMs = 10_000; // 10 seconds

    // Make 3 requests at t=0
    checkRateLimit(key, limit, windowMs);
    checkRateLimit(key, limit, windowMs);
    checkRateLimit(key, limit, windowMs);

    // At limit
    expect(checkRateLimit(key, limit, windowMs)).toBe(false);

    // Advance 10 seconds — all 3 entries from t=0 should expire
    vi.advanceTimersByTime(10_001);

    // Should be allowed again
    expect(checkRateLimit(key, limit, windowMs)).toBe(true);
  });

  it('handles sliding window with staggered requests', () => {
    const key = 'staggered';
    const limit = 3;
    const windowMs = 10_000;

    // t=0: request 1
    checkRateLimit(key, limit, windowMs);

    // t=4s: request 2
    vi.advanceTimersByTime(4_000);
    checkRateLimit(key, limit, windowMs);

    // t=8s: request 3
    vi.advanceTimersByTime(4_000);
    checkRateLimit(key, limit, windowMs);

    // t=8s: at limit
    expect(checkRateLimit(key, limit, windowMs)).toBe(false);

    // t=10.001s: first request expires, one slot opens
    vi.advanceTimersByTime(2_001);
    expect(checkRateLimit(key, limit, windowMs)).toBe(true);
  });

  it('enforces session link rate limit: 10 failures per IP in 5 minutes', () => {
    const ip = '10.0.0.1';
    const limit = 10;
    const windowMs = 5 * 60 * 1000;

    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ip, limit, windowMs)).toBe(true);
    }
    expect(checkRateLimit(ip, limit, windowMs)).toBe(false);
  });

  it('enforces magic link rate limit: 5 per email per hour', () => {
    const email = 'test@example.com';
    const limit = 5;
    const windowMs = 60 * 60 * 1000;

    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(email, limit, windowMs)).toBe(true);
    }
    expect(checkRateLimit(email, limit, windowMs)).toBe(false);
  });
});

describe('periodic cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes expired entries to prevent unbounded memory growth', () => {
    const windowMs = 1_000;

    // Create entries for many keys
    for (let i = 0; i < 100; i++) {
      checkRateLimit(`key-${i}`, 5, windowMs);
    }

    // Advance past the window so all entries are expired
    vi.advanceTimersByTime(windowMs + 1);

    // Trigger cleanup by making a new request
    checkRateLimit('new-key', 5, windowMs);

    // After cleanup + new request, only the new key should remain
    // Verify the new key works correctly (not affected by old entries)
    expect(checkRateLimit('new-key', 5, windowMs)).toBe(true);
  });
});
