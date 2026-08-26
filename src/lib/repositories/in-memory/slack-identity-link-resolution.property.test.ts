/**
 * Property Tests for Slack User ID Resolution
 *
 * Feature: integration-hardening, Property 10: Slack user ID resolution from repository
 *
 * **Validates: Requirements 7.3**
 *
 * For any SlackIdentityLink record in the repository, resolving that record's
 * slackUserId SHALL return the corresponding memberId. For any slackUserId NOT
 * in the repository, resolution SHALL return null.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { InMemorySlackIdentityLinkRepository } from './slack-identity-link.repository';

/**
 * Arbitrary for memberId strings — UUID-like identifiers.
 */
const memberIdArb = fc.stringMatching(/^mem_[a-z0-9]{8,16}$/);

/**
 * Arbitrary for Slack user ID strings — realistic Slack format (e.g., U01ABC23DEF).
 */
const slackUserIdArb = fc.stringMatching(/^U[A-Z0-9]{8,12}$/);

/**
 * Arbitrary for a pair of memberId and slackUserId.
 */
const identityLinkArb = fc.record({
  memberId: memberIdArb,
  slackUserId: slackUserIdArb,
});

/**
 * Arbitrary for a non-empty array of unique identity link pairs.
 * Each memberId and slackUserId is unique within the array.
 */
const uniqueLinksArb = fc
  .uniqueArray(identityLinkArb, {
    minLength: 1,
    maxLength: 20,
    comparator: (a, b) => a.memberId === b.memberId || a.slackUserId === b.slackUserId,
  });

describe('Property 10: Slack user ID resolution from repository', () => {
  it('findBySlackUserId returns the correct memberId for any stored record', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueLinksArb, async (links) => {
        const repo = new InMemorySlackIdentityLinkRepository();

        // Create all identity links in the repository
        for (const link of links) {
          await repo.create({ memberId: link.memberId, slackUserId: link.slackUserId });
        }

        // Verify each slackUserId resolves to the correct memberId
        for (const link of links) {
          const result = await repo.findBySlackUserId(link.slackUserId);
          expect(result).not.toBeNull();
          expect(result!.memberId).toBe(link.memberId);
          expect(result!.slackUserId).toBe(link.slackUserId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('findBySlackUserId returns null for any slackUserId NOT in the repository', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueLinksArb,
        slackUserIdArb,
        async (links, unknownSlackUserId) => {
          // Ensure the unknown ID is not in the stored links
          fc.pre(!links.some((l) => l.slackUserId === unknownSlackUserId));

          const repo = new InMemorySlackIdentityLinkRepository();

          // Create all identity links in the repository
          for (const link of links) {
            await repo.create({ memberId: link.memberId, slackUserId: link.slackUserId });
          }

          // Verify unknown slackUserId resolves to null
          const result = await repo.findBySlackUserId(unknownSlackUserId);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
