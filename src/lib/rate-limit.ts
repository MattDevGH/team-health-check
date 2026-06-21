/**
 * In-memory sliding window rate limiter.
 *
 * Usage:
 *   - Session link validation: checkRateLimit(ip, 10, 5 * 60 * 1000)
 *   - Magic link requests: checkRateLimit(email, 5, 60 * 60 * 1000)
 *
 * Validates: Requirements 6.7, 7.5
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000; // Run cleanup every 60 seconds
let lastCleanup = Date.now();

/**
 * Removes expired entries from the store to prevent unbounded memory growth.
 * Uses a conservative max window of 1 hour — entries older than this are always stale.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const maxWindowMs = 60 * 60 * 1000; // 1 hour max window

  for (const [key, entry] of store) {
    // Remove timestamps older than the max window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < maxWindowMs);

    // If no timestamps remain, delete the key entirely
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }

  lastCleanup = now;
}

/**
 * Checks whether a request identified by `key` is within the rate limit.
 *
 * @param key - Unique identifier for the rate limit bucket (e.g., IP address, email)
 * @param limit - Maximum number of requests allowed within the window
 * @param windowMs - Time window in milliseconds
 * @returns `true` if the request is allowed, `false` if rate limited
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();

  // Periodic cleanup to prevent unbounded memory growth
  if (now - lastCleanup >= CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries();
  }

  const entry = store.get(key);

  if (!entry) {
    store.set(key, { timestamps: [now] });
    return true;
  }

  // Remove timestamps outside the current window (sliding window)
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

/**
 * Resets the rate limit store. Used for testing only.
 */
export function resetRateLimitStore(): void {
  store.clear();
  lastCleanup = Date.now();
}
