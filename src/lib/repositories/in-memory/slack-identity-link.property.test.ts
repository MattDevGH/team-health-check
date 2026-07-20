/**
 * Property Tests for InMemorySlackIdentityLinkRepository
 *
 * Feature: integration-hardening, Property 9: SlackIdentityLink upsert is idempotent
 *
 * **Validates: Requirements 7.2**
 *
 * For any memberId that already has a SlackIdentityLink record, verifying a new
 * pairing code for that member SHALL result in exactly one SlackIdentityLink record
 * for that memberId (updated, not duplicated), with the slackUserId from the latest
 * pairing code.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { InMemorySlackIdentityLinkRepository } from './slack-identity-link.repository';

/**
 * Arbitrary for memberId — UUID-like member identifiers.
 */
const memberIdArb = fc.stringMatching(/^mem_[a-z0-9]{8,16}$/);

/**
 * Arbitrary for slackUserId — Slack user ID format (U + alphanumeric).
 */
const slackUserIdArb = fc.stringMatching(/^U[A-Z0-9]{6,12}$/);

/**
 * Arbitrary for a non-empty array of 2-10 unique slackUserIds to simulate
 * sequential upsert calls with different Slack identities.
 */
const slackUserIdArrayArb = fc
  .uniqueArray(slackUserIdArb, { minLength: 2, maxLength: 10 })
  .filter((arr) => arr.length >= 2);

describe('Feature: integration-hardening, Property 9: SlackIdentityLink upsert is idempotent', () => {
  it('after sequential upserts for the same memberId, exactly one record exists with the last slackUserId', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberIdArb,
        slackUserIdArrayArb,
        async (memberId, slackUserIds) => {
          const repo = new InMemorySlackIdentityLinkRepository();

          // Perform sequential upserts with each slackUserId
          for (const slackUserId of slackUserIds) {
            await repo.upsertByMemberId(memberId, slackUserId);
          }

          const lastSlackUserId = slackUserIds[slackUserIds.length - 1];

          // Verify exactly one record exists for this memberId with the LAST slackUserId
          const record = await repo.findByMemberId(memberId);
          expect(record).not.toBeNull();
          expect(record!.memberId).toBe(memberId);
          expect(record!.slackUserId).toBe(lastSlackUserId);

          // Verify all previous slackUserIds no longer resolve
          for (let i = 0; i < slackUserIds.length - 1; i++) {
            const previousId = slackUserIds[i];
            const resolved = await repo.findBySlackUserId(previousId);
            expect(resolved).toBeNull();
          }

          // Verify the latest slackUserId does resolve to the correct record
          const latestResolved = await repo.findBySlackUserId(lastSlackUserId);
          expect(latestResolved).not.toBeNull();
          expect(latestResolved!.memberId).toBe(memberId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
