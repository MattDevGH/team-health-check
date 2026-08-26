/**
 * Unit tests for bot-initiated Slack prompt eligibility.
 *
 * A member is prompted only when they have a Slack link, are not marked away,
 * and the team's configured Slack delivery window is currently open in the
 * team's timezone.
 *
 * Requirements: Integration 8.1, 8.3, 8.4; Original 5.1, 5.2, 5.3
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createNotificationService } from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { HealthCheckSession, Team, TeamMember } from '@/lib/repositories/entities';

function createRecordingSink(): NotificationSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(memberId: string): Promise<void> {
      calls.push(memberId);
    },
  };
}

describe('NotificationService.sendSlackPrompt eligibility', () => {
  let repos: Repositories;
  let sink: ReturnType<typeof createRecordingSink>;
  let team: Team;
  let member: TeamMember;
  let session: HealthCheckSession;

  const linkedChecker: SlackLinkChecker = { async hasSlackLink() { return true; } };

  function build(now: Date, slackLinkChecker: SlackLinkChecker = linkedChecker) {
    return createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationSink: sink,
      slackLinkChecker,
      now: () => now,
    });
  }

  async function setDeliveryWindow(start: string | null, end: string | null): Promise<void> {
    await repos.team.update(team.id, {
      slackDeliveryStart: start,
      slackDeliveryEnd: end,
    });
  }

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sink = createRecordingSink();
    team = await repos.team.create({ name: 'Window Team', timezone: 'UTC' });
    member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Alice',
      email: 'alice@example.com',
    });
    session = await repos.session.create({ teamId: team.id, status: 'open' });
  });

  it('prompts a linked member when no delivery window is configured', async () => {
    const service = build(new Date('2026-08-24T03:00:00.000Z'));

    await expect(service.sendSlackPrompt(member.id, session)).resolves.toBe(true);
    expect(sink.calls).toEqual([member.id]);
  });

  it('skips a member who is marked away', async () => {
    await repos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2026-08-20T00:00:00.000Z'),
      awayUntil: new Date('2026-08-28T00:00:00.000Z'),
    });
    const service = build(new Date('2026-08-24T10:00:00.000Z'));

    await expect(service.sendSlackPrompt(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a member without a Slack link before any other check', async () => {
    const unlinked: SlackLinkChecker = { async hasSlackLink() { return false; } };
    const service = build(new Date('2026-08-24T10:00:00.000Z'), unlinked);

    await expect(service.sendSlackPrompt(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a prompt raised before the delivery window opens', async () => {
    await setDeliveryWindow('09:00', '17:00');
    const service = build(new Date('2026-08-24T08:59:00.000Z'));

    await expect(service.sendSlackPrompt(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a prompt raised after the delivery window closes', async () => {
    await setDeliveryWindow('09:00', '17:00');
    const service = build(new Date('2026-08-24T17:01:00.000Z'));

    await expect(service.sendSlackPrompt(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('prompts on both delivery window boundaries', async () => {
    await setDeliveryWindow('09:00', '17:00');

    await expect(
      build(new Date('2026-08-24T09:00:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(true);
    await expect(
      build(new Date('2026-08-24T17:00:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(true);
    expect(sink.calls).toEqual([member.id, member.id]);
  });

  it('evaluates the delivery window in the team timezone', async () => {
    await repos.team.update(team.id, { timezone: 'Europe/London' });
    await setDeliveryWindow('09:00', '17:00');

    // 08:30 UTC is 09:30 BST — inside the window
    await expect(
      build(new Date('2026-08-24T08:30:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(true);

    // 16:30 UTC is 17:30 BST — outside the window
    await expect(
      build(new Date('2026-08-24T16:30:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(false);

    expect(sink.calls).toEqual([member.id]);
  });

  it('supports a delivery window that spans midnight', async () => {
    await setDeliveryWindow('22:00', '06:00');

    await expect(
      build(new Date('2026-08-24T23:00:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(true);
    await expect(
      build(new Date('2026-08-24T12:00:00.000Z')).sendSlackPrompt(member.id, session),
    ).resolves.toBe(false);

    expect(sink.calls).toEqual([member.id]);
  });
});
