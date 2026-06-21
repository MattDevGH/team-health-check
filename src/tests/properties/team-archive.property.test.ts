import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';
import { createSessionService } from '@/lib/services/session.service';

/**
 * Generates valid member names: 1-100 chars that are not whitespace-only after trim.
 */
const validMemberNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length >= 1);

/**
 * Generates a member count between 2 and 10.
 */
const memberCountArb = fc.integer({ min: 2, max: 10 });

/**
 * Whether to create an open session before archiving.
 */
const hasOpenSessionArb = fc.boolean();

describe('Team Archive Properties', () => {
  /**
   * **Validates: Requirements 1.9, 1.10**
   *
   * Property 6: Archive/unarchive round-trip restores functionality
   *
   * For any active team with any configuration (members, open session),
   * archiving and then unarchiving SHALL restore the team to a state where
   * new sessions can be opened and all historical data remains accessible.
   */
  describe('Property 6: Archive/unarchive round-trip restores functionality', () => {
    it('archive sets archived=true and closes any open session', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          hasOpenSessionArb,
          async (memberCount, hasOpenSession) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });
            const sessionService = createSessionService({
              sessionRepo: repos.session,
              sessionLinkRepo: repos.sessionLink,
              teamMemberRepo: repos.teamMember,
              responseRepo: repos.response,
              sessionAggregateRepo: repos.sessionAggregate,
            });

            const creatorId = 'creator-1';
            const team = await teamService.create('Archive Test Team', undefined, creatorId);

            // Add N members
            for (let i = 0; i < memberCount; i++) {
              await teamService.addMember(team.id, `Member ${i}`, undefined);
            }

            // Optionally open a session
            let openSession = null;
            if (hasOpenSession) {
              openSession = await sessionService.open(team.id, creatorId);
            }

            // Archive the team
            await teamService.archive(team.id, creatorId);

            // Verify archived=true
            const archivedTeam = await repos.team.findById(team.id);
            expect(archivedTeam!.archived).toBe(true);

            // Verify open session is closed
            if (openSession) {
              const closedSession = await repos.session.findById(openSession.id);
              expect(closedSession!.status).toBe('closed');
              expect(closedSession!.actualCloseAt).not.toBeNull();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('unarchive restores archived=false', async () => {
      await fc.assert(
        fc.asyncProperty(memberCountArb, async (memberCount) => {
          const repos = createInMemoryRepositories();
          const teamService = createTeamService({
            teamRepo: repos.team,
            teamMemberRepo: repos.teamMember,
            teamMemberRoleRepo: repos.teamMemberRole,
            auditLogRepo: repos.auditLog,
            sessionRepo: repos.session,
          });

          const creatorId = 'creator-1';
          const team = await teamService.create('Unarchive Test', undefined, creatorId);

          for (let i = 0; i < memberCount; i++) {
            await teamService.addMember(team.id, `Member ${i}`, undefined);
          }

          // Archive then unarchive
          await teamService.archive(team.id, creatorId);
          await teamService.unarchive(team.id, creatorId);

          // Verify archived=false
          const restoredTeam = await repos.team.findById(team.id);
          expect(restoredTeam!.archived).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it('after unarchive, team members still exist and historical data is preserved', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          fc.array(validMemberNameArb, { minLength: 2, maxLength: 10 }),
          async (_, memberNames) => {
            // Deduplicate names to avoid ConflictError
            const uniqueNames = [...new Set(memberNames.map((n) => n.trim()))].filter(
              (n) => n.length > 0
            );
            if (uniqueNames.length < 2) return; // need at least 2 members

            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });
            const sessionService = createSessionService({
              sessionRepo: repos.session,
              sessionLinkRepo: repos.sessionLink,
              teamMemberRepo: repos.teamMember,
              responseRepo: repos.response,
              sessionAggregateRepo: repos.sessionAggregate,
            });

            const creatorId = 'creator-1';
            const team = await teamService.create('RoundTrip Team', undefined, creatorId);

            // Add members
            for (const name of uniqueNames) {
              await teamService.addMember(team.id, name, undefined);
            }

            // Open and close a session to create historical data
            const session = await sessionService.open(team.id, creatorId);
            await sessionService.close(session.id, creatorId);

            // Record member count before archive
            const membersBefore = await repos.teamMember.findByTeamId(team.id);
            const memberCountBefore = membersBefore.length;

            // Archive then unarchive
            await teamService.archive(team.id, creatorId);
            await teamService.unarchive(team.id, creatorId);

            // Verify members are preserved
            const membersAfter = await repos.teamMember.findByTeamId(team.id);
            expect(membersAfter.length).toBe(memberCountBefore);

            // Verify historical session data preserved
            const sessions = await repos.session.findByTeamId(team.id);
            expect(sessions.length).toBeGreaterThanOrEqual(1);
            expect(sessions.some((s) => s.status === 'closed')).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('after unarchive, a new session can be opened', async () => {
      await fc.assert(
        fc.asyncProperty(
          memberCountArb,
          hasOpenSessionArb,
          async (memberCount, hasOpenSession) => {
            const repos = createInMemoryRepositories();
            const teamService = createTeamService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
              sessionRepo: repos.session,
            });
            const sessionService = createSessionService({
              sessionRepo: repos.session,
              sessionLinkRepo: repos.sessionLink,
              teamMemberRepo: repos.teamMember,
              responseRepo: repos.response,
              sessionAggregateRepo: repos.sessionAggregate,
            });

            const creatorId = 'creator-1';
            const team = await teamService.create('Restore Team', undefined, creatorId);

            for (let i = 0; i < memberCount; i++) {
              await teamService.addMember(team.id, `Member ${i}`, undefined);
            }

            // Optionally open a session before archive
            if (hasOpenSession) {
              await sessionService.open(team.id, creatorId);
            }

            // Archive then unarchive
            await teamService.archive(team.id, creatorId);
            await teamService.unarchive(team.id, creatorId);

            // Verify we can open a new session after unarchive
            const newSession = await sessionService.open(team.id, creatorId);
            expect(newSession).toBeDefined();
            expect(newSession.status).toBe('open');
            expect(newSession.teamId).toBe(team.id);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
