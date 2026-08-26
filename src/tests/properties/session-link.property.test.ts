import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createSessionService } from '@/lib/services/session.service';

/**
 * Arbitrary for generating a count of team members (1-15).
 */
const memberCountArb = fc.integer({ min: 1, max: 15 });

describe('Session Link Properties', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * Property 13: Session link generation and round-trip validation
   *
   * For any team with N members (1-15), opening a session SHALL generate
   * exactly N session links, each with a cryptographically random token of
   * at least 32 characters, all unique, and each link correctly references
   * the session and member. Looking up each token via findByToken() SHALL
   * return the correct member/session association.
   */
  describe('Property 13: Session link generation and round-trip validation', () => {
    it('generates exactly N links with ≥32 char unique tokens and valid round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(memberCountArb, async (memberCount) => {
          const repos = createInMemoryRepositories();
          const sessionService = createSessionService({
            sessionRepo: repos.session,
            sessionLinkRepo: repos.sessionLink,
            teamMemberRepo: repos.teamMember,
            responseRepo: repos.response,
            sessionAggregateRepo: repos.sessionAggregate,
          });

          const teamId = 'team-link-test';

          // Create N team members with unique indexed names
          const members = [];
          for (let i = 0; i < memberCount; i++) {
            const member = await repos.teamMember.create({
              teamId,
              name: `Member ${i}`,
              email: `member${i}@example.com`,
            });
            members.push(member);
          }

          // Open a session — this triggers link generation
          const session = await sessionService.open(teamId, 'user-1');

          // Verify exactly N links were created (one per member)
          const tokens: string[] = [];
          for (const member of members) {
            const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
            expect(link).not.toBeNull();
            tokens.push(link!.token);
          }

          expect(tokens.length).toBe(memberCount);

          // Verify each token is ≥32 characters
          for (const token of tokens) {
            expect(token.length).toBeGreaterThanOrEqual(32);
          }

          // Verify all tokens are unique (no collisions)
          const uniqueTokens = new Set(tokens);
          expect(uniqueTokens.size).toBe(tokens.length);

          // Round-trip validation: look up each token and verify correct member/session
          for (let i = 0; i < members.length; i++) {
            const foundLink = await repos.sessionLink.findByToken(tokens[i]);
            expect(foundLink).not.toBeNull();
            expect(foundLink!.sessionId).toBe(session.id);
            expect(foundLink!.memberId).toBe(members[i].id);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
