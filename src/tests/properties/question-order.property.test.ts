import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';

const EXPECTED_ORDER = [
  'q-delivering-value',
  'q-team-collaboration',
  'q-ease-of-delivery',
  'q-learning-improving',
  'q-psychological-safety',
];

/**
 * **Validates: Requirements 9.1, 9.3**
 *
 * Property 20: Question order invariant
 *
 * For any session and any team member, the questions SHALL always be returned
 * in the fixed order: Delivering Value, Team Collaboration, Ease of Delivery,
 * Learning and Improving, Psychological Safety.
 */
describe('Property 20: Question order invariant', () => {
  it('questions are always returned in fixed displayOrder regardless of session/member context', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of sessions (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Number of members (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Number of teams (1-5)
        fc.integer({ min: 1, max: 5 }),
        async (numSessions, numMembers, numTeams) => {
          const repos = createInMemoryRepositories();

          // Create teams
          const teams = [];
          for (let t = 0; t < numTeams; t++) {
            const team = await repos.team.create({
              name: `Team ${t}`,
              privacyMode: 'anonymous',
              timezone: 'Europe/London',
            });
            teams.push(team);
          }

          // Create members across teams
          const members = [];
          for (let m = 0; m < numMembers; m++) {
            const team = teams[m % numTeams];
            const member = await repos.teamMember.create({
              teamId: team.id,
              name: `Member ${m}`,
              email: `member${m}@test.com`,
            });
            members.push(member);
          }

          // Create sessions across teams
          const sessions = [];
          for (let s = 0; s < numSessions; s++) {
            const team = teams[s % numTeams];
            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });
            sessions.push(session);
          }

          // For each combination of session and member, verify question order
          for (const _session of sessions) {
            for (const _member of members) {
              const questions = await repos.question.findAll();

              // Must always return exactly 5 questions
              expect(questions).toHaveLength(5);

              // Must always be in the exact fixed order
              const questionIds = questions.map(q => q.id);
              expect(questionIds).toEqual(EXPECTED_ORDER);

              // displayOrder must be strictly ascending
              for (let i = 1; i < questions.length; i++) {
                expect(questions[i].displayOrder).toBeGreaterThan(
                  questions[i - 1].displayOrder,
                );
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('question order is identical across multiple consecutive calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of calls to make (2-20)
        fc.integer({ min: 2, max: 20 }),
        async (numCalls) => {
          const repos = createInMemoryRepositories();

          const results: string[][] = [];

          for (let i = 0; i < numCalls; i++) {
            const questions = await repos.question.findAll();
            results.push(questions.map(q => q.id));
          }

          // All calls must return the same order
          for (const result of results) {
            expect(result).toEqual(EXPECTED_ORDER);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
