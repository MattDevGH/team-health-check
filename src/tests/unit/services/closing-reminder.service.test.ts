/**
 * Unit tests for closing-reminder delivery and its once-per-session guarantee.
 *
 * The scheduler ticks every few minutes, so the reminder must be recorded
 * durably rather than in process memory, which does not survive between
 * serverless invocations.
 *
 * Requirements: Original 13.2, 13.3, 13.10; Integration 8.2, 8.3, 8.4
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createNotificationService } from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { HealthCheckSession, Team, TeamMember } from '@/lib/repositories/entities';

const NOW = new Date('2026-08-27T09:00:00.000Z');

function createRecordingSink(): NotificationSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(memberId: string, type: string): Promise<void> {
      calls.push(`${type}:${memberId}`);
    },
  };
}

describe('NotificationService.sendClosingReminder', () => {
  let repos: Repositories;
  let sink: ReturnType<typeof createRecordingSink>;
  let team: Team;
  let member: TeamMember;
  let session: HealthCheckSession;

  const linked: SlackLinkChecker = { async hasSlackLink() { return true; } };

  function build(slackLinkChecker: SlackLinkChecker = linked) {
    return createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationDeliveryRepo: repos.notificationDelivery,
      notificationSink: sink,
      slackLinkChecker,
      now: () => NOW,
    });
  }

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sink = createRecordingSink();
    team = await repos.team.create({ name: 'Reminder Team' });
    member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Alice',
      email: 'alice@example.com',
    });
    session = await repos.session.create({ teamId: team.id, status: 'open' });
  });

  it('sends a reminder to an eligible member and records the delivery', async () => {
    await expect(build().sendClosingReminder(member.id, session)).resolves.toBe(true);

    expect(sink.calls).toEqual([`closing_reminder:${member.id}`]);
    await expect(
      repos.notificationDelivery.hasDelivered(member.id, session.id, 'closing_reminder'),
    ).resolves.toBe(true);
  });

  it('does not send a second reminder on a later tick', async () => {
    const service = build();

    await expect(service.sendClosingReminder(member.id, session)).resolves.toBe(true);
    await expect(service.sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toHaveLength(1);
  });

  it('does not send a second reminder from a freshly constructed service', async () => {
    // A new serverless invocation builds a new service; the guard must be durable
    await build().sendClosingReminder(member.id, session);
    await expect(build().sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toHaveLength(1);
  });

  it('reminds again for a different session', async () => {
    const next = await repos.session.create({ teamId: team.id, status: 'open' });

    await build().sendClosingReminder(member.id, session);
    await expect(build().sendClosingReminder(member.id, next)).resolves.toBe(true);

    expect(sink.calls).toHaveLength(2);
  });

  it('records nothing when the member has reminders disabled', async () => {
    await repos.teamMember.update(member.id, { remindersEnabled: false });

    await expect(build().sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toEqual([]);
    await expect(
      repos.notificationDelivery.hasDelivered(member.id, session.id, 'closing_reminder'),
    ).resolves.toBe(false);
  });

  it('records nothing when the member is away', async () => {
    await repos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2026-08-25T00:00:00.000Z'),
      awayUntil: new Date('2026-08-30T00:00:00.000Z'),
    });

    await expect(build().sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toEqual([]);
    await expect(
      repos.notificationDelivery.hasDelivered(member.id, session.id, 'closing_reminder'),
    ).resolves.toBe(false);
  });

  it('records nothing when the member has answered every question', async () => {
    for (const question of await repos.question.findAll()) {
      await repos.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId: question.id,
        score: 4,
      });
    }

    await expect(build().sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toEqual([]);
    await expect(
      repos.notificationDelivery.hasDelivered(member.id, session.id, 'closing_reminder'),
    ).resolves.toBe(false);
  });

  it('records nothing when the member has no Slack link', async () => {
    const unlinked: SlackLinkChecker = { async hasSlackLink() { return false; } };

    await expect(build(unlinked).sendClosingReminder(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toEqual([]);
    await expect(
      repos.notificationDelivery.hasDelivered(member.id, session.id, 'closing_reminder'),
    ).resolves.toBe(false);
  });
});
