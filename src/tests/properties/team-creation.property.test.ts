import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';

/**
 * Generates valid team names: strings of 1-100 chars that are not whitespace-only
 * (after trim, length >= 1).
 */
const validTeamNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1);

/**
 * Generates optional descriptions: undefined or strings up to 500 chars.
 */
const optionalDescriptionArb = fc.option(
  fc.string({ minLength: 0, maxLength: 500 }),
  { nil: undefined }
);

describe('Team Creation Properties', () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * Property 1: Valid entity creation preserves data
   *
   * For any valid team name (1-100 non-whitespace-only characters) and optional
   * description (up to 500 chars), creating the team and reading it back SHALL
   * return the same trimmed name and description that was submitted.
   */
  describe('Property 1: Valid entity creation preserves data', () => {
    it('team.name equals the trimmed input name after creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          validTeamNameArb,
          optionalDescriptionArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (name, description, creatorId) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });

            const team = await teamService.create(name, description, creatorId);

            expect(team.name).toBe(name.trim());
          }
        )
      );
    });

    it('team.description equals the provided description after creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          validTeamNameArb,
          optionalDescriptionArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (name, description, creatorId) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });

            const team = await teamService.create(name, description, creatorId);

            // description passed as undefined should come back as undefined or null
            if (description === undefined) {
              expect(team.description == null).toBe(true);
            } else {
              expect(team.description).toBe(description);
            }
          }
        )
      );
    });
  });
});
