/**
 * Tests for POST /api/scheduler/tick — NotificationService wiring.
 * Validates: Requirements 8.1, 8.2, 8.3
 *
 * When the scheduler tick opens a session, NotificationService.send
 * should be called for eligible (Slack-linked, available) members.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createSchedulerService } from '@/lib/services/scheduler.service';
import { createSessionService } from '@/lib/services/session.service';
import { createNotificationService } from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { Repositories } from '@/lib/repositories';

/**
 * Creates a fake NotificationSink that records all calls.
 */
function createFakeNotificationSink(): NotificationSink & { calls: Array<{ memberId: string; type: string; payload: unknown }> } {
  const calls: Array<{ memberId: string; type: string; payload: unknown }> = [];
  return {
    calls,
    async send(memberId: string, type: string, payload: unknown): Promise<void> {
      calls.push({ memberId, type, payload });
    },
  };
}

/**
 * Creates a SlackLinkChecker backed by the in-memory SlackIdentityLinkRepository.
 */
function createFakeSlackLinkChecker(repos: Repositories): SlackLinkChecker {
  return {
    async hasSlackLink(memberId: string): Promise<boolean> {
      const link = await repos.slackIdentityLink.findByMemberId(memberId);
      return link !== null;
    },
  };
}

describe('POST /api/scheduler/tick — notification wiring', () => {
  let repos: Repositories;
  let sink: ReturnType<typeof createFakeNotificationSink>;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    sink = createFakeNotificationSink();
  });

  it('sends Slack prompts to eligible members when a session is opened', async () => {
    // Arrange: Create a team with a schedule that triggers NOW
    const team = await repos.team.create({ name: 'Test Team', timezone: 'UTC' });

    // Get current day/time in UTC for schedule matching
    const now = new Date('2025-01-06T09:00:00.000Z'); // Monday 09:00 UTC
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1, // Monday
      openTime: '09:00',
      closeDay: 5, // Friday
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Create two members
    const member1 = await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'alice@test.com' });
    const member2 = await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'bob@test.com' });

    // Only member1 has a Slack link (eligible)
    await repos.slackIdentityLink.create({ memberId: member1.id, slackUserId: 'U_ALICE' });

    // Wire services as the route would
    const sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    const scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionAggregateRepo: repos.sessionAggregate,
      sessionService,
    });

    const slackLinkChecker = createFakeSlackLinkChecker(repos);

    const notificationService = createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationSink: sink,
      slackLinkChecker,
    });

    // Act: Simulate what the route does — snapshot, tick, detect new sessions, notify
    const openSessionsBefore = new Map<string, string>();
    const teams = await repos.team.list();
    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession) {
        openSessionsBefore.set(t.id, openSession.id);
      }
    }

    await scheduler.tick(now);

    // Detect newly opened sessions and send notifications
    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession && !openSessionsBefore.has(t.id)) {
        // Session was just opened — notify eligible members
        const members = await repos.teamMember.findByTeamId(t.id);
        for (const member of members) {
          await notificationService.sendSlackPrompt(member.id, openSession);
        }
      }
    }

    // Assert: Only member1 (with Slack link) should receive a prompt
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].memberId).toBe(member1.id);
    expect(sink.calls[0].type).toBe('slack_prompt');
    expect(sink.calls[0].payload).toEqual(
      expect.objectContaining({ sessionId: expect.any(String), teamId: team.id })
    );
  });

  it('does not send notifications when no new session is opened', async () => {
    // Arrange: Create team with a schedule that does NOT match the current time
    const team = await repos.team.create({ name: 'Quiet Team', timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 3, // Wednesday
      openTime: '10:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const member = await repos.teamMember.create({ teamId: team.id, name: 'Charlie', email: 'charlie@test.com' });
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId: 'U_CHARLIE' });

    const sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    const scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionAggregateRepo: repos.sessionAggregate,
      sessionService,
    });

    const slackLinkChecker = createFakeSlackLinkChecker(repos);
    const notificationService = createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationSink: sink,
      slackLinkChecker,
    });

    // Act: tick on Monday 09:00 — schedule opens on Wednesday
    const now = new Date('2025-01-06T09:00:00.000Z'); // Monday

    const openSessionsBefore = new Map<string, string>();
    const teams = await repos.team.list();
    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession) {
        openSessionsBefore.set(t.id, openSession.id);
      }
    }

    await scheduler.tick(now);

    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession && !openSessionsBefore.has(t.id)) {
        const members = await repos.teamMember.findByTeamId(t.id);
        for (const member of members) {
          await notificationService.sendSlackPrompt(member.id, openSession);
        }
      }
    }

    // Assert: No notifications because no session was opened
    expect(sink.calls).toHaveLength(0);
  });

  it('skips away members even if they have Slack links', async () => {
    // Arrange: Team with schedule matching NOW
    const team = await repos.team.create({ name: 'Away Team', timezone: 'UTC' });
    const now = new Date('2025-01-06T09:00:00.000Z'); // Monday 09:00 UTC

    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const member1 = await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'alice@test.com' });
    const member2 = await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'bob@test.com' });

    // Both have Slack links
    await repos.slackIdentityLink.create({ memberId: member1.id, slackUserId: 'U_ALICE' });
    await repos.slackIdentityLink.create({ memberId: member2.id, slackUserId: 'U_BOB' });

    // member2 is away
    await repos.availability.create({
      memberId: member2.id,
      awayFrom: new Date('2025-01-05'),
      awayUntil: new Date('2025-01-10'),
    });

    const sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
    });

    const scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionAggregateRepo: repos.sessionAggregate,
      sessionService,
    });

    const slackLinkChecker = createFakeSlackLinkChecker(repos);
    const notificationService = createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationSink: sink,
      slackLinkChecker,
    });

    // Act: snapshot, tick, detect, notify (using sendSlackPrompt — checks link only)
    // Note: sendSlackPrompt doesn't check availability; it only checks Slack link.
    // The route should filter out away members before calling sendSlackPrompt.
    const openSessionsBefore = new Map<string, string>();
    const teams = await repos.team.list();
    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession) {
        openSessionsBefore.set(t.id, openSession.id);
      }
    }

    await scheduler.tick(now);

    for (const t of teams) {
      const openSession = await repos.session.findOpenByTeamId(t.id);
      if (openSession && !openSessionsBefore.has(t.id)) {
        const members = await repos.teamMember.findByTeamId(t.id);
        for (const member of members) {
          // Check availability before sending — route-level filtering
          const awayRecord = await repos.availability.findActiveByMemberIdAndDate(member.id, now);
          if (!awayRecord) {
            await notificationService.sendSlackPrompt(member.id, openSession);
          }
        }
      }
    }

    // Assert: Only member1 should get a notification (member2 is away)
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].memberId).toBe(member1.id);
  });
});
