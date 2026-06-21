import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createResponseService } from '@/lib/services/response.service';
import { ForbiddenError, ConflictError } from '@/lib/errors';

describe('Response Submission Access Control Properties', () => {
  /**
   * **Validates: Requirements 3.6, 3.7, 3.8**
   *
   * Property 9: Submissions succeed if and only if the member belongs to the team
   *
   * For any two distinct teams with members, when a session is open for team-A,
   * submissions from team-A members SHALL succeed, and submissions from team-B
   * members SHALL be rejected with ForbiddenError.
   */
  describe('Property 9: Submissions succeed if and only if the member belongs to the team', () => {
    it('team-A members succeed; team-B members are rejected with ForbiddenError', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 members for team-A and 1-5 members for team-B
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          // Generate a valid score for submissions
          fc.integer({ min: 1, max: 5 }),
          async (teamAMemberCount, teamBMemberCount, score) => {
            const repos = createInMemoryRepositories();
            const responseService = createResponseService({
              responseRepo: repos.response,
              sessionRepo: repos.session,
              teamMemberRepo: repos.teamMember,
            });

            // Create two teams
            const teamAId = 'team-A';
            const teamBId = 'team-B';

            // Create members in team-A
            const teamAMembers: string[] = [];
            for (let i = 0; i < teamAMemberCount; i++) {
              const member = await repos.teamMember.create({
                teamId: teamAId,
                name: `member-A-${i}`,
                email: `a${i}@example.com`,
              });
              teamAMembers.push(member.id);
            }

            // Create members in team-B
            const teamBMembers: string[] = [];
            for (let i = 0; i < teamBMemberCount; i++) {
              const member = await repos.teamMember.create({
                teamId: teamBId,
                name: `member-B-${i}`,
                email: `b${i}@example.com`,
              });
              teamBMembers.push(member.id);
            }

            // Open a session for team-A
            const session = await repos.session.create({
              teamId: teamAId,
              status: 'open',
            });

            const questionId = 'q-delivering-value';

            // All team-A members should succeed
            for (const memberId of teamAMembers) {
              const response = await responseService.upsert({
                memberId,
                sessionId: session.id,
                questionId,
                score,
              });
              expect(response.score).toBe(score);
              expect(response.memberId).toBe(memberId);
            }

            // All team-B members should be rejected with ForbiddenError
            for (const memberId of teamBMembers) {
              await expect(
                responseService.upsert({
                  memberId,
                  sessionId: session.id,
                  questionId,
                  score,
                })
              ).rejects.toBeInstanceOf(ForbiddenError);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.9, 6.5**
   *
   * Property 10: Closed sessions reject all submissions
   *
   * For any team with N members, when a session is opened and then closed,
   * all subsequent submission attempts from any member SHALL be rejected
   * with ConflictError indicating the session is closed.
   */
  describe('Property 10: Closed sessions reject all submissions', () => {
    it('all members are rejected with ConflictError on a closed session', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 members
          fc.integer({ min: 1, max: 5 }),
          // Generate valid scores for submission attempts
          fc.integer({ min: 1, max: 5 }),
          async (memberCount, score) => {
            const repos = createInMemoryRepositories();
            const responseService = createResponseService({
              responseRepo: repos.response,
              sessionRepo: repos.session,
              teamMemberRepo: repos.teamMember,
            });

            const teamId = 'team-closed';

            // Create members
            const memberIds: string[] = [];
            for (let i = 0; i < memberCount; i++) {
              const member = await repos.teamMember.create({
                teamId,
                name: `member-${i}`,
                email: `m${i}@example.com`,
              });
              memberIds.push(member.id);
            }

            // Open a session then close it
            const session = await repos.session.create({
              teamId,
              status: 'open',
            });
            await repos.session.update(session.id, {
              status: 'closed',
              actualCloseAt: new Date(),
            });

            const questionId = 'q-team-collaboration';

            // All members should be rejected with ConflictError
            for (const memberId of memberIds) {
              const error = await responseService
                .upsert({
                  memberId,
                  sessionId: session.id,
                  questionId,
                  score,
                })
                .catch((e: unknown) => e);

              expect(error).toBeInstanceOf(ConflictError);
              expect((error as ConflictError).message).toBe('Session is closed');
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
