/**
 * Property Tests for AuthService — Pairing Code SlackIdentityLink Persistence
 *
 * Feature: integration-hardening, Property 8: Pairing code verification persists SlackIdentityLink
 *
 * **Validates: Requirements 7.1**
 *
 * For any valid (unexpired, unused) pairing code and any memberId, calling
 * `verifyPairingCode` SHALL result in a SlackIdentityLink record existing in
 * the repository with that memberId and the slackUserId from the pairing code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories } from '@/lib/repositories';
import { createAuthService } from '@/lib/services/auth.service';
import { InMemorySlackIdentityLinkRepository } from '@/lib/repositories/in-memory/slack-identity-link.repository';

/**
 * Arbitrary for memberId — UUID-like member identifiers.
 */
const memberIdArb = fc.stringMatching(/^mem_[a-z0-9]{8,16}$/);

/**
 * Arbitrary for slackUserId — Slack user ID format (U + alphanumeric).
 */
const slackUserIdArb = fc.stringMatching(/^U[A-Z0-9]{8,10}$/);

describe('Feature: integration-hardening, Property 8: Pairing code verification persists SlackIdentityLink', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifyPairingCode creates a SlackIdentityLink record with correct slackUserId for any valid code and memberId', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberIdArb,
        slackUserIdArb,
        async (memberId, slackUserId) => {
          const repos = createInMemoryRepositories();
          const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();

          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            slackIdentityLinkRepo,
          });

          // Generate a pairing code for the slackUserId
          const code = await authService.generatePairingCode(slackUserId);

          // Verify the pairing code with the given memberId (within 10-minute window)
          const result = await authService.verifyPairingCode(memberId, code);

          // Verification should succeed
          expect(result).not.toBeNull();
          expect(result!.slackUserId).toBe(slackUserId);

          // SlackIdentityLink record should exist with correct data
          const link = await slackIdentityLinkRepo.findByMemberId(memberId);
          expect(link).not.toBeNull();
          expect(link!.memberId).toBe(memberId);
          expect(link!.slackUserId).toBe(slackUserId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
