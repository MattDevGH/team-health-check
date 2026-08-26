import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createAuthService } from '@/lib/services/auth.service';

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Arbitrary for a time offset within the valid window (0 to 9 min 59 sec).
 * Values in milliseconds: [0, 599_999].
 */
const validDelayArb = fc.integer({ min: 0, max: TEN_MINUTES_MS - 1 });

/**
 * Arbitrary for a time offset past the expiry (10 min 1 sec to 60 min).
 * Values in milliseconds: [600_001, 3_600_000].
 */
const expiredDelayArb = fc.integer({ min: TEN_MINUTES_MS + 1, max: 60 * 60 * 1000 });

/**
 * Arbitrary for a Slack user ID string.
 */
const slackUserIdArb = fc.stringMatching(/^U[A-Z0-9]{8,10}$/);

describe('Pairing Code Properties', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 2.3, 2.5**
   *
   * Property 7: Pairing codes expire within 10 minutes
   *
   * For any generated pairing code, verifying it at a time strictly greater
   * than 10 minutes after generation SHALL fail (return null), while verifying
   * it within the 10-minute window with the correct code SHALL succeed.
   */
  describe('Property 7: Pairing codes expire within 10 minutes', () => {
    it('verification within 10 minutes succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(slackUserIdArb, validDelayArb, async (slackUserId, delayMs) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
          });

          // Generate the pairing code at t=0
          const code = await authService.generatePairingCode(slackUserId);

          // Advance time by the valid delay (within 10 min window)
          vi.advanceTimersByTime(delayMs);

          // Verify code — should succeed
          const result = await authService.verifyPairingCode('member-1', code);
          expect(result).not.toBeNull();
          expect(result!.slackUserId).toBe(slackUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('verification after 10 minutes fails', async () => {
      await fc.assert(
        fc.asyncProperty(slackUserIdArb, expiredDelayArb, async (slackUserId, delayMs) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
          });

          // Generate the pairing code at t=0
          const code = await authService.generatePairingCode(slackUserId);

          // Advance time past expiry
          vi.advanceTimersByTime(delayMs);

          // Verify code — should fail (expired)
          const result = await authService.verifyPairingCode('member-1', code);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });
});
