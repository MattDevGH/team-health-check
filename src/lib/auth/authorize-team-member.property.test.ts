/**
 * Property Tests for Team Membership Authorization
 *
 * Feature: integration-hardening, Property 11: Team membership authorization
 *
 * **Validates: Requirements 9.1, 9.2**
 *
 * For any authenticated member and any teamId, if the member's teamId does not
 * match the requested teamId, the team-scoped endpoint SHALL return HTTP 403.
 * If the member belongs to the team, the request SHALL be allowed through.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { createAuthorizeTeamMember } from './authorize-team-member';
import { InMemoryTeamMemberRepository } from '@/lib/repositories/in-memory/team-member.repository';
import { ForbiddenError } from '@/lib/errors';

/**
 * Arbitrary for team IDs — UUID-like identifiers.
 */
const teamIdArb = fc.stringMatching(/^team_[a-z0-9]{8,16}$/);

/**
 * Arbitrary for member names — simple alphabetic names to avoid duplicate conflicts.
 */
const memberNameArb = fc.stringMatching(/^[A-Z][a-z]{2,10}$/);

/**
 * Arbitrary for email addresses — unique enough to avoid collisions.
 */
const emailArb = fc.stringMatching(/^[a-z]{3,8}[0-9]{1,4}@test\.com$/);

describe('Property 11: Team membership authorization', () => {
  it('allows access when member belongs to the requested team', async () => {
    await fc.assert(
      fc.asyncProperty(
        teamIdArb,
        memberNameArb,
        emailArb,
        async (teamId, name, email) => {
          const teamMemberRepo = new InMemoryTeamMemberRepository();
          const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo });

          // Create a member in the target team
          const member = await teamMemberRepo.create({
            teamId,
            name,
            email,
          });

          // Authorization should resolve without error when teamId matches
          await expect(
            authorizeTeamMember(member.id, teamId)
          ).resolves.toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('throws ForbiddenError when member belongs to a different team', async () => {
    await fc.assert(
      fc.asyncProperty(
        teamIdArb,
        teamIdArb,
        memberNameArb,
        emailArb,
        async (memberTeamId, requestedTeamId, name, email) => {
          // Ensure the two teamIds are different (mismatch scenario)
          fc.pre(memberTeamId !== requestedTeamId);

          const teamMemberRepo = new InMemoryTeamMemberRepository();
          const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo });

          // Create a member in one team
          const member = await teamMemberRepo.create({
            teamId: memberTeamId,
            name,
            email,
          });

          // Authorization should throw ForbiddenError when requesting a different team
          try {
            await authorizeTeamMember(member.id, requestedTeamId);
            // If we reach here, the test fails — should have thrown
            expect.fail('Expected ForbiddenError to be thrown');
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(ForbiddenError);
            expect((error as ForbiddenError).statusCode).toBe(403);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
