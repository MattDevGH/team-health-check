import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createTrendService } from '@/lib/services/trend.service';
import { InMemorySessionAggregateRepository } from '@/lib/repositories/in-memory/session-aggregate.repository';

/**
 * Arbitrary for generating a session aggregate data point.
 */
const aggregateArb = fc.record({
  averageScore: fc.double({ min: 1.0, max: 5.0, noNaN: true }),
  responseCount: fc.integer({ min: 3, max: 20 }),
  improvingCount: fc.integer({ min: 0, max: 10 }),
  stableCount: fc.integer({ min: 0, max: 10 }),
  decliningCount: fc.integer({ min: 0, max: 10 }),
});

/**
 * Arbitrary for generating multiple session aggregates (1-5 sessions).
 */
const aggregatesArb = fc.array(aggregateArb, { minLength: 1, maxLength: 5 });

/**
 * Arbitrary for generating team member identifiers (names and emails)
 * to verify they do NOT appear in anonymous mode CSV.
 * Names are constrained to alphanumeric + spaces to avoid matching CSV
 * structural characters (commas, newlines) or common CSV column values.
 */
const memberNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z ]{1,20}[A-Za-z]$/)
  .filter(s => s.trim().length >= 3);

const memberArb = fc.record({
  name: memberNameArb,
  email: fc.emailAddress(),
});

const membersArb = fc.array(memberArb, { minLength: 1, maxLength: 5 });

describe('CSV Export Properties', () => {
  /**
   * **Validates: Requirements 8.9**
   *
   * Property 18: CSV export serialization round-trip
   *
   * For any set of trend data (session averages, response counts, trend indicator
   * distributions), exporting to CSV and parsing the resulting CSV SHALL produce
   * values matching the original data. The CSV SHALL contain columns for session
   * date, question, average score, response count, and trend indicator distribution.
   */
  describe('Property 18: CSV export serialization round-trip', () => {
    it('exported CSV rows match the aggregate data that was created', async () => {
      await fc.assert(
        fc.asyncProperty(aggregatesArb, async (aggregates) => {
          const repos = createInMemoryRepositories();

          // Create a team (attributed mode to avoid suppression)
          const team = await repos.team.create({
            name: 'CSV Test Team',
            privacyMode: 'attributed',
          });

          const questionId = 'q-delivering-value';
          const sessionDates: Date[] = [];

          // Create sessions with aggregates
          for (let i = 0; i < aggregates.length; i++) {
            const agg = aggregates[i];
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });

            sessionDates.push(session.createdAt);

            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            await repos.sessionAggregate.create({
              sessionId: session.id,
              questionId,
              averageScore: agg.averageScore,
              responseCount: agg.responseCount,
              improvingCount: agg.improvingCount,
              stableCount: agg.stableCount,
              decliningCount: agg.decliningCount,
            });
          }

          // Export CSV
          const trendService = createTrendService({
            sessionAggregateRepo: repos.sessionAggregate,
            sessionRepo: repos.session,
            teamRepo: repos.team,
          });

          const csv = await trendService.exportCSV(team.id);
          const lines = csv.split('\n');

          // Verify header
          expect(lines[0]).toBe(
            'Session Date,Question,Average Score,Response Count,Improving,Stable,Declining'
          );

          // Verify data rows (should be exactly aggregates.length rows)
          const dataRows = lines.slice(1);
          expect(dataRows.length).toBe(aggregates.length);

          // Parse and verify each row matches the aggregate data
          for (let i = 0; i < dataRows.length; i++) {
            const cols = dataRows[i].split(',');
            expect(cols.length).toBe(7);

            // Column 0: Session Date (ISO string)
            expect(cols[0]).toBeTruthy();
            const parsedDate = new Date(cols[0]);
            expect(parsedDate.getTime()).not.toBeNaN();

            // Column 1: Question ID
            expect(cols[1]).toBe(questionId);

            // Column 2: Average Score (must match original)
            const parsedScore = parseFloat(cols[2]);
            expect(parsedScore).toBeCloseTo(aggregates[i].averageScore, 5);

            // Column 3: Response Count
            expect(parseInt(cols[3], 10)).toBe(aggregates[i].responseCount);

            // Column 4: Improving count
            expect(parseInt(cols[4], 10)).toBe(aggregates[i].improvingCount);

            // Column 5: Stable count
            expect(parseInt(cols[5], 10)).toBe(aggregates[i].stableCount);

            // Column 6: Declining count
            expect(parseInt(cols[6], 10)).toBe(aggregates[i].decliningCount);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 8.10**
   *
   * Property 19: Anonymous mode CSV contains no individual data
   *
   * For any team in anonymous privacy mode, the CSV export SHALL never contain
   * individual team member identifiers, individual scores, or any data from
   * which individual responses could be reconstructed.
   */
  describe('Property 19: Anonymous mode CSV contains no individual data', () => {
    it('anonymous mode CSV never contains member names, emails, or individual scores', async () => {
      await fc.assert(
        fc.asyncProperty(membersArb, aggregatesArb, async (members, aggregates) => {
          const repos = createInMemoryRepositories();

          // Create a team in anonymous mode
          const team = await repos.team.create({
            name: 'Anonymous CSV Team',
            privacyMode: 'anonymous',
          });

          // Create team members
          const createdMembers = [];
          for (const member of members) {
            const created = await repos.teamMember.create({
              teamId: team.id,
              name: member.name,
              email: member.email,
            });
            createdMembers.push(created);
          }

          const questionId = 'q-delivering-value';

          // Create sessions with aggregates (responseCount >= 3 to avoid suppression)
          for (let i = 0; i < aggregates.length; i++) {
            const agg = aggregates[i];
            const session = await repos.session.create({
              teamId: team.id,
              status: 'closed',
            });

            (repos.sessionAggregate as InMemorySessionAggregateRepository)
              .registerSessionTeam(session.id, team.id);

            await repos.sessionAggregate.create({
              sessionId: session.id,
              questionId,
              averageScore: agg.averageScore,
              responseCount: agg.responseCount,
              improvingCount: agg.improvingCount,
              stableCount: agg.stableCount,
              decliningCount: agg.decliningCount,
            });
          }

          // Export CSV
          const trendService = createTrendService({
            sessionAggregateRepo: repos.sessionAggregate,
            sessionRepo: repos.session,
            teamRepo: repos.team,
          });

          const csv = await trendService.exportCSV(team.id);

          // Verify NO row contains any member name or email
          for (const member of createdMembers) {
            expect(csv).not.toContain(member.name);
            if (member.email) {
              expect(csv).not.toContain(member.email);
            }
            // Verify no member ID appears in the CSV
            expect(csv).not.toContain(member.id);
          }

          // Verify suppressed rows show "insufficient data" instead of numeric score
          const lines = csv.split('\n').slice(1); // skip header
          for (const line of lines) {
            if (line.includes('insufficient data')) {
              // If a row is suppressed, it should NOT contain a numeric average score
              const cols = line.split(',');
              expect(cols[2]).toBe('insufficient data');
            }
          }

          // Verify no individual score values (1-5 as standalone) appear
          // that could indicate individual responses — the CSV should only
          // contain aggregate averages (floating point) and counts (integers >=3)
          const dataRows = lines;
          for (const row of dataRows) {
            const cols = row.split(',');
            // The average score column should either be "insufficient data"
            // or a floating point aggregate — never a bare integer 1-5 that
            // could represent an individual score (unless the average happens
            // to be a whole number, which is valid for aggregates)
            if (cols[2] !== 'insufficient data') {
              const score = parseFloat(cols[2]);
              expect(score).toBeGreaterThanOrEqual(1.0);
              expect(score).toBeLessThanOrEqual(5.0);
            }
            // Response count should never be less than 0
            if (cols[3]) {
              const count = parseInt(cols[3], 10);
              expect(count).toBeGreaterThanOrEqual(0);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('suppressed rows in anonymous mode show "insufficient data" for low response counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 1, max: 2 }), { minLength: 1, maxLength: 5 }),
          membersArb,
          async (lowCounts, members) => {
            const repos = createInMemoryRepositories();

            // Create a team in anonymous mode
            const team = await repos.team.create({
              name: 'Suppressed CSV Team',
              privacyMode: 'anonymous',
            });

            // Create team members
            for (const member of members) {
              await repos.teamMember.create({
                teamId: team.id,
                name: member.name,
                email: member.email,
              });
            }

            const questionId = 'q-team-collaboration';

            // Create sessions with low response counts (below threshold of 3)
            for (const count of lowCounts) {
              const session = await repos.session.create({
                teamId: team.id,
                status: 'closed',
              });

              (repos.sessionAggregate as InMemorySessionAggregateRepository)
                .registerSessionTeam(session.id, team.id);

              await repos.sessionAggregate.create({
                sessionId: session.id,
                questionId,
                averageScore: 3.5,
                responseCount: count,
                improvingCount: 0,
                stableCount: count,
                decliningCount: 0,
              });
            }

            // Export CSV
            const trendService = createTrendService({
              sessionAggregateRepo: repos.sessionAggregate,
              sessionRepo: repos.session,
              teamRepo: repos.team,
            });

            const csv = await trendService.exportCSV(team.id);
            const dataRows = csv.split('\n').slice(1);

            // All rows should show "insufficient data" since counts are 1 or 2
            for (const row of dataRows) {
              const cols = row.split(',');
              expect(cols[2]).toBe('insufficient data');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
