/**
 * Unit tests for detecting when closing reminders are due.
 *
 * Requirement 13.2: reminders go out a configurable time before the session
 * closes, defaulting to 24 hours.
 *
 * Requirements: Original 13.2, 13.3; Integration 8.2
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import {
  createNotificationService,
  DEFAULT_REMINDER_LEAD_MS,
} from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { HealthCheckSession, Team } from '@/lib/repositories/entities';

/** Session closes Friday 17:00 UTC. */
const CLOSES_AT = new Date('2026-08-28T17:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function createRecordingSink(): NotificationSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(memberId: string, type: string): Promise<void> {
      calls.push(`${type}:${memberId}`);
    },
  };
}

describe('NotificationService.sendDueClosingReminders', () => {
  let repos: Repositories;
  let sink: ReturnType<typeof createRecordingSink>;
  let team: Team;
  let session: HealthCheckSession;

  const linked: SlackLinkChecker = { async hasSlackLink() { return true; } };

  function build(now: Date) {
    return createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationDeliveryRepo: repos.notificationDelivery,
      notificationSink: sink,
      slackLinkChecker: linked,
      now: () => now,
    });
  }

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sink = createRecordingSink();
    team = await repos.team.create({ name: 'Due Team' });
    await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'a@example.com' });
    await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'b@example.com' });
    session = await repos.session.create({
      teamId: team.id,
      status: 'open',
      scheduledCloseAt: CLOSES_AT,
    });
  });

  it('defaults the lead time to 24 hours', () => {
    expect(DEFAULT_REMINDER_LEAD_MS).toBe(24 * HOUR_MS);
  });

  it('sends nothing before the lead window opens', async () => {
    // 25 hours out — one hour too early
    const service = build(new Date(CLOSES_AT.getTime() - 25 * HOUR_MS));

    await expect(service.sendDueClosingReminders(session)).resolves.toBe(0);
    expect(sink.calls).toEqual([]);
  });

  it('reminds every eligible member once the lead window opens', async () => {
    const service = build(new Date(CLOSES_AT.getTime() - 23 * HOUR_MS));

    await expect(service.sendDueClosingReminders(session)).resolves.toBe(2);
    expect(sink.calls).toHaveLength(2);
  });

  it('sends nothing once the close time has passed', async () => {
    const service = build(new Date(CLOSES_AT.getTime() + HOUR_MS));

    await expect(service.sendDueClosingReminders(session)).resolves.toBe(0);
    expect(sink.calls).toEqual([]);
  });

  it('sends nothing when the session has no scheduled close', async () => {
    const unscheduled = await repos.session.create({ teamId: team.id, status: 'open' });
    const service = build(new Date(CLOSES_AT.getTime() - HOUR_MS));

    await expect(service.sendDueClosingReminders(unscheduled)).resolves.toBe(0);
    expect(sink.calls).toEqual([]);
  });

  it('honours a configured lead time', async () => {
    const twoHours = 2 * HOUR_MS;
    const threeHoursOut = new Date(CLOSES_AT.getTime() - 3 * HOUR_MS);

    // Outside a two-hour lead window, even though the default would have fired
    await expect(build(threeHoursOut).sendDueClosingReminders(session, twoHours)).resolves.toBe(0);

    const oneHourOut = new Date(CLOSES_AT.getTime() - HOUR_MS);
    await expect(build(oneHourOut).sendDueClosingReminders(session, twoHours)).resolves.toBe(2);
  });

  it('does not repeat reminders on later ticks inside the same window', async () => {
    const firstTick = new Date(CLOSES_AT.getTime() - 23 * HOUR_MS);
    const laterTick = new Date(CLOSES_AT.getTime() - 22 * HOUR_MS);

    await expect(build(firstTick).sendDueClosingReminders(session)).resolves.toBe(2);
    await expect(build(laterTick).sendDueClosingReminders(session)).resolves.toBe(0);

    expect(sink.calls).toHaveLength(2);
  });
});
