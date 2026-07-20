/**
 * Integration tests: Session lifecycle end-to-end.
 * Validates: Requirements 3.2, 3.3, 3.4, 3.9
 *
 * Exercises the full session lifecycle through the service layer
 * using in-memory repositories. Tests both scheduler-driven and
 * manual session management flows.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createContainer, type Container } from '@/lib/container';
import { createSchedulerService } from '@/lib/services/scheduler.service';
import { createSessionService } from '@/lib/services/session.service';

describe('Session lifecycle integration', () => {
  let repos: Repositories;
  let container: Container;
  let scheduler: ReturnType<typeof createSchedulerService>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);

    // Wire the scheduler service (not part of container — requires sessionService dep)
    const sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionAggregateRepo: repos.sessionAggregate,
      sessionService,
    });
  });

  describe('Scheduled session lifecycle', () => {
    it('scheduler tick opens session → links generated → tick closes session → aggregates materialised', async () => {
      // 1. Create a team
      const team = await repos.team.create({ name: 'Alpha Squad', timezone: 'UTC' });

      // 2. Add members
      const alice = await repos.teamMember.create({
        teamId: team.id,
        name: 'Alice',
        email: 'alice@example.com',
      });
      const bob = await repos.teamMember.create({
        teamId: team.id,
        name: 'Bob',
        email: 'bob@example.com',
      });
      const charlie = await repos.teamMember.create({
        teamId: team.id,
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      // 3. Configure schedule: opens Monday 09:00, closes Friday 17:00
      await repos.teamSchedule.create({
        teamId: team.id,
        cadence: 'weekly',
        openDay: 1, // Monday
        openTime: '09:00',
        closeDay: 5, // Friday
        closeTime: '17:00',
        timezone: 'UTC',
      });

      // 4. Simulate scheduler tick at open time (Monday 09:00)
      const openTime = new Date('2024-01-08T09:00:00.000Z'); // Monday
      await scheduler.tick(openTime);

      // 5. Verify session was opened
      const openSession = await repos.session.findOpenByTeamId(team.id);
      expect(openSession).not.toBeNull();
      expect(openSession!.status).toBe('open');

      // 6. Verify session links were generated for all 3 members
      const aliceLink = await repos.sessionLink.findByMemberAndSession(alice.id, openSession!.id);
      const bobLink = await repos.sessionLink.findByMemberAndSession(bob.id, openSession!.id);
      const charlieLink = await repos.sessionLink.findByMemberAndSession(charlie.id, openSession!.id);

      expect(aliceLink).not.toBeNull();
      expect(bobLink).not.toBeNull();
      expect(charlieLink).not.toBeNull();

      // Verify tokens are cryptographically random (≥32 chars)
      expect(aliceLink!.token.length).toBeGreaterThanOrEqual(32);
      expect(bobLink!.token.length).toBeGreaterThanOrEqual(32);
      expect(charlieLink!.token.length).toBeGreaterThanOrEqual(32);

      // Verify tokens are unique
      const tokens = [aliceLink!.token, bobLink!.token, charlieLink!.token];
      expect(new Set(tokens).size).toBe(3);

      // 7. Submit responses for the session
      await container.response.upsert({
        memberId: alice.id,
        sessionId: openSession!.id,
        questionId: 'q-delivering-value',
        score: 4,
        trendIndicator: 'improving',
      });
      await container.response.upsert({
        memberId: alice.id,
        sessionId: openSession!.id,
        questionId: 'q-team-collaboration',
        score: 5,
        trendIndicator: 'stable',
      });
      await container.response.upsert({
        memberId: bob.id,
        sessionId: openSession!.id,
        questionId: 'q-delivering-value',
        score: 3,
        trendIndicator: 'declining',
      });
      await container.response.upsert({
        memberId: charlie.id,
        sessionId: openSession!.id,
        questionId: 'q-delivering-value',
        score: 5,
        trendIndicator: 'improving',
      });

      // 8. Simulate scheduler tick at close time (Friday 17:00)
      const closeTime = new Date('2024-01-12T17:00:00.000Z'); // Friday
      await scheduler.tick(closeTime);

      // 9. Verify session was closed
      const closedSession = await repos.session.findById(openSession!.id);
      expect(closedSession!.status).toBe('closed');
      expect(closedSession!.actualCloseAt).not.toBeNull();

      // 10. Simulate scheduler tick >30s later to materialise aggregates
      // The actualCloseAt is set to wall-clock time (new Date()) inside close(),
      // so we need to use a time relative to real "now" for the quiet period check.
      const materializeTime = new Date(Date.now() + 60_000); // 60s after real wall-clock close
      await scheduler.tick(materializeTime);

      // 11. Verify aggregates were materialised
      const aggregates = await repos.sessionAggregate.findBySessionId(openSession!.id);
      expect(aggregates.length).toBeGreaterThan(0);

      // 12. Verify aggregate for "Delivering Value" (scores: 4, 3, 5 → avg 4.0)
      const deliveringValueAgg = aggregates.find(a => a.questionId === 'q-delivering-value');
      expect(deliveringValueAgg).toBeDefined();
      expect(deliveringValueAgg!.averageScore).toBe(4.0);
      expect(deliveringValueAgg!.responseCount).toBe(3);
      expect(deliveringValueAgg!.improvingCount).toBe(2);
      expect(deliveringValueAgg!.stableCount).toBe(0);
      expect(deliveringValueAgg!.decliningCount).toBe(1);

      // 13. Verify aggregate for "Team Collaboration" (scores: 5 → avg 5.0)
      const teamCollabAgg = aggregates.find(a => a.questionId === 'q-team-collaboration');
      expect(teamCollabAgg).toBeDefined();
      expect(teamCollabAgg!.averageScore).toBe(5.0);
      expect(teamCollabAgg!.responseCount).toBe(1);
      expect(teamCollabAgg!.stableCount).toBe(1);
    });
  });

  describe('Manual session management', () => {
    it('manual open with existing open session closes first and materialises aggregates', async () => {
      // 1. Create a team with members
      const team = await repos.team.create({ name: 'Beta Squad', timezone: 'UTC' });
      const alice = await repos.teamMember.create({
        teamId: team.id,
        name: 'Alice',
        email: 'alice@beta.com',
      });
      const bob = await repos.teamMember.create({
        teamId: team.id,
        name: 'Bob',
        email: 'bob@beta.com',
      });

      // 2. Open a session manually
      const firstSession = await container.session.open(team.id, 'dm-user-1');
      expect(firstSession.status).toBe('open');

      // Verify links generated for first session
      const aliceFirstLink = await repos.sessionLink.findByMemberAndSession(alice.id, firstSession.id);
      const bobFirstLink = await repos.sessionLink.findByMemberAndSession(bob.id, firstSession.id);
      expect(aliceFirstLink).not.toBeNull();
      expect(bobFirstLink).not.toBeNull();

      // 3. Submit responses to the first session
      await container.response.upsert({
        memberId: alice.id,
        sessionId: firstSession.id,
        questionId: 'q-delivering-value',
        score: 3,
        trendIndicator: 'stable',
      });
      await container.response.upsert({
        memberId: bob.id,
        sessionId: firstSession.id,
        questionId: 'q-delivering-value',
        score: 5,
        trendIndicator: 'improving',
      });

      // 4. Open another session while one is already open
      const secondSession = await container.session.open(team.id, 'dm-user-1');

      // 5. Verify the first session got closed automatically
      const firstSessionAfter = await repos.session.findById(firstSession.id);
      expect(firstSessionAfter!.status).toBe('closed');
      expect(firstSessionAfter!.actualCloseAt).not.toBeNull();

      // 6. Verify the new session is now the active one
      const activeSession = await repos.session.findOpenByTeamId(team.id);
      expect(activeSession).not.toBeNull();
      expect(activeSession!.id).toBe(secondSession.id);
      expect(activeSession!.status).toBe('open');

      // 7. Verify links generated for second session
      const aliceSecondLink = await repos.sessionLink.findByMemberAndSession(alice.id, secondSession.id);
      const bobSecondLink = await repos.sessionLink.findByMemberAndSession(bob.id, secondSession.id);
      expect(aliceSecondLink).not.toBeNull();
      expect(bobSecondLink).not.toBeNull();

      // 8. Materialise aggregates for the closed first session (simulate quiet period elapsed)
      // Manually trigger materialisation since there's no scheduler tick here
      await container.session.materializeAggregates(firstSession.id);

      // 9. Verify closed session has its aggregates materialised
      const aggregates = await repos.sessionAggregate.findBySessionId(firstSession.id);
      expect(aggregates.length).toBeGreaterThan(0);

      const deliveringValueAgg = aggregates.find(a => a.questionId === 'q-delivering-value');
      expect(deliveringValueAgg).toBeDefined();
      // Scores: 3, 5 → avg = 4.0
      expect(deliveringValueAgg!.averageScore).toBe(4.0);
      expect(deliveringValueAgg!.responseCount).toBe(2);
      expect(deliveringValueAgg!.improvingCount).toBe(1);
      expect(deliveringValueAgg!.stableCount).toBe(1);
      expect(deliveringValueAgg!.decliningCount).toBe(0);
    });
  });
});
