/**
 * When a refused key may try again.
 *
 * Requirements: Slack Sign In 4.3
 *
 * The window slides, so the honest answer is when the oldest attempt still
 * inside it falls out — not the whole window, which overstates the wait every
 * time but the first.
 *
 * Its own file with a controlled clock, because the difference between those
 * two answers is invisible to any test where every attempt happens at once.
 * A service-level test asserting "some positive number under an hour" passed
 * against an implementation that always returned the full window.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { checkRateLimit, resetRateLimitStore, retryAfterMs } from '@/lib/rate-limit';

const LIMIT = 5;
const WINDOW = 60 * 60 * 1000;
const START = new Date('2026-09-16T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  resetRateLimitStore();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Spends `count` attempts on a key, `apartMs` apart. */
function spend(key: string, count: number, apartMs = 0): void {
  for (let i = 0; i < count; i += 1) {
    checkRateLimit(key, LIMIT, WINDOW);
    if (apartMs) vi.advanceTimersByTime(apartMs);
  }
}

describe('a key that is not limited', () => {
  it('has nothing to wait for', () => {
    spend('under', LIMIT - 1);

    expect(retryAfterMs('under', LIMIT, WINDOW)).toBe(0);
  });

  it('has nothing to wait for when it has never been seen', () => {
    expect(retryAfterMs('unknown', LIMIT, WINDOW)).toBe(0);
  });
});

describe('a key at the limit', () => {
  it('waits the whole window when every attempt was just now', () => {
    spend('burst', LIMIT);

    expect(retryAfterMs('burst', LIMIT, WINDOW)).toBe(WINDOW);
  });

  it('waits only for the oldest attempt to age out', () => {
    /*
     * The assertion the sliding window exists for, and the one that fails
     * against an implementation returning the full window every time.
     *
     * `spend` advances after each attempt, including the last, so five
     * attempts ten minutes apart land at 0, 10, 20, 30 and 40 with the clock
     * at 50. The oldest is fifty minutes into a sixty-minute window, so ten
     * remain — not another hour.
     */
    spend('spread', LIMIT, 10 * 60 * 1000);

    expect(retryAfterMs('spread', LIMIT, WINDOW)).toBe(10 * 60 * 1000);
  });

  it('shrinks as time passes', () => {
    spend('ticking', LIMIT);
    const first = retryAfterMs('ticking', LIMIT, WINDOW);

    vi.advanceTimersByTime(15 * 60 * 1000);

    expect(retryAfterMs('ticking', LIMIT, WINDOW)).toBe(first - 15 * 60 * 1000);
  });

  it('reaches zero once the oldest attempt has left the window', () => {
    spend('aged', LIMIT);

    vi.advanceTimersByTime(WINDOW);

    expect(retryAfterMs('aged', LIMIT, WINDOW)).toBe(0);
  });

  it('agrees with the limiter about whether the key is blocked', () => {
    /*
     * Two functions reading the same store, and a disagreement between them
     * would mean a reply telling somebody to come back at a time they are
     * still refused — or refusing somebody it has told is free to retry.
     */
    spend('agreement', LIMIT, 10 * 60 * 1000);
    expect(retryAfterMs('agreement', LIMIT, WINDOW)).toBeGreaterThan(0);

    vi.advanceTimersByTime(retryAfterMs('agreement', LIMIT, WINDOW));

    expect(checkRateLimit('agreement', LIMIT, WINDOW)).toBe(true);
  });
});
