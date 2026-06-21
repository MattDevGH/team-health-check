import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTeamService } from '@/lib/services/team.service';

/**
 * **Validates: Requirements 1.6**
 *
 * Property 5: Member removal preserves historical responses
 *
 * For any team member who has submitted responses across any number of sessions,
 * removing them from the team SHALL preserve all their historical response records
 * in the database while disassociating them from the active team roster.
 */
describe('Property 5: Member removal preserves historical responses', () => {
  it('removing a member preserves all response records across sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // number of sessions (M)
        fc.integer({ min: 1, max: 5 }), // number of questions per session (N)
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 25 }), // scores
        async (sessionCount, questionCount, scores) => {
          const repos = createInMemoryRepositories();
          const teamService = createTeamService({
            teamRepo: repos.team,
            teamMemberRepo: repos.teamMember,
            teamMemberRoleRepo: repos.teamMemberRole,
            auditLogRepo: repos.auditLog,
            sessionRepo: repos.session,
          });

          // Create a team and add a member
          const team = await teamService.create('Test Team', undefined, 'creator-1');
          const member = await teamService.addMember(team.id, 'Test Member', 'test@example.com');

          // Create M sessions and submit N responses per session
          const sessionIds: string[] = [];
          let scoreIndex = 0;

          for (let s = 0; s < sessionCount; s++) {
            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });
            sessionIds.push(session.id);

            for (let q = 0; q < questionCount; q++) {
              const score = scores[scoreIndex % scores.length];
              scoreIndex++;
              await repos.response.upsert({
                memberId: member.id,
                sessionId: session.id,
                questionId: `q-${q}`,
                score,
              });
            }
          }

          // Calculate expected total responses
          const expectedResponseCount = sessionCount * questionCount;

          // Verify responses exist before removal
          let totalResponsesBefore = 0;
          for (const sessionId of sessionIds) {
            const responses = await repos.response.findBySession(sessionId);
            const memberResponses = responses.filter(r => r.memberId === member.id);
            totalResponsesBefore += memberResponses.length;
          }
          expect(totalResponsesBefore).toBe(expectedResponseCount);

          // Remove the member
          await teamService.removeMember(team.id, member.id, 'creator-1');

          // Verify member is no longer in the team roster
          const membersAfter = await repos.teamMember.findByTeamId(team.id);
          const removedMember = membersAfter.find(m => m.id === member.id);
          expect(removedMember).toBeUndefined();

          // Verify ALL response records still exist after removal
          let totalResponsesAfter = 0;
          for (const sessionId of sessionIds) {
            const responses = await repos.response.findBySession(sessionId);
            const memberResponses = responses.filter(r => r.memberId === member.id);
            totalResponsesAfter += memberResponses.length;
          }
          expect(totalResponsesAfter).toBe(expectedResponseCount);

          // Verify each individual response is intact with correct data
          for (let s = 0; s < sessionCount; s++) {
            const responses = await repos.response.findBySession(sessionIds[s]);
            const memberResponses = responses.filter(r => r.memberId === member.id);
            expect(memberResponses).toHaveLength(questionCount);

            for (const response of memberResponses) {
              expect(response.memberId).toBe(member.id);
              expect(response.sessionId).toBe(sessionIds[s]);
              expect(response.score).toBeGreaterThanOrEqual(1);
              expect(response.score).toBeLessThanOrEqual(5);
            }
          }
        }
      )
    );
  });
});
