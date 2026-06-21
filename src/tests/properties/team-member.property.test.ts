import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';
import { ConflictError } from '@/lib/errors';

/**
 * Generates valid member names: 1-100 chars that are not whitespace-only after trim.
 */
const validMemberNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1);

/**
 * Generates emails that pass Zod's email validation.
 * Constraints: local part is alphanumeric (with dots/hyphens/underscores in the middle),
 * cannot start or end with a dot, and no consecutive dots.
 */
const zodValidEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,14}$/).filter((s) => s.length >= 1),
    fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/).filter((s) => s.length >= 1),
    fc.constantFrom('com', 'org', 'net', 'io', 'dev')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Generates optional valid emails (or undefined).
 */
const optionalValidEmailArb = fc.option(zodValidEmailArb, { nil: undefined });

describe('Team Member Properties', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * Property 4: Team member uniqueness invariant
   *
   * For any team and any (name, email) combination, adding that member a second
   * time to the same team SHALL be rejected with ConflictError, while the first
   * addition SHALL succeed. The team SHALL contain exactly one record for that
   * combination.
   */
  describe('Property 4: Team member uniqueness invariant', () => {
    it('adding the same (name, email) twice throws ConflictError on second attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMemberNameArb,
          optionalValidEmailArb,
          async (name, email) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });

            // Create a team first
            const team = await teamService.create('Test Team', undefined, 'creator-1');

            // First addition should succeed
            const member = await teamService.addMember(team.id, name, email);
            expect(member).toBeDefined();
            expect(member.name).toBe(name.trim());

            // Second addition with same (name, email) should throw ConflictError
            await expect(
              teamService.addMember(team.id, name, email)
            ).rejects.toThrow(ConflictError);
          }
        )
      );
    });

    it('after duplicate attempt, exactly one record exists for the (name, email) combo', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMemberNameArb,
          optionalValidEmailArb,
          async (name, email) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });

            // Create a team
            const team = await teamService.create('Test Team', undefined, 'creator-1');

            // Add member successfully
            await teamService.addMember(team.id, name, email);

            // Attempt duplicate (expected to fail)
            try {
              await teamService.addMember(team.id, name, email);
            } catch {
              // expected
            }

            // Verify exactly one record for this member exists
            // (plus the creator member from team creation)
            const members = await repos.teamMember.findByTeamId(team.id);
            const matchingMembers = members.filter(
              (m) => m.name === name.trim() && m.email === (email ?? null)
            );
            expect(matchingMembers).toHaveLength(1);
          }
        )
      );
    });
  });
});
