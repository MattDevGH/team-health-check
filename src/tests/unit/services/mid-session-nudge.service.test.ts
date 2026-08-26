/**
 * Unit tests for mid-session nudge eligibility.
 *
 * Requirement 13.6: only weekly-mode members who did not respond in the previous
 * closed session and are not marked away.
 * Requirement 13.7: never nudge someone who was away during that previous session.
 * Requirement 13.8: at most one nudge per session per member, durably.
 *
 * Requirements: Original 13.1, 13.6, 13.7, 13.8
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createNotificationService } from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { HealthCheckSession, Team, TeamMember } from '@/lib/repositories/entities';

/** Far enough ahead that "away now" is false for windows around the real clock. */
const NOW = new Date('2027-01-06T12:00:00.000Z');

function createRecordingSink(): NotificationSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(memberId: string, type: string): Promise<void> {
      calls.push(`${type}:${memberId}`);
    },
  };
}

describe('NotificationService.sendMidSessionNudge eligibility', () => {
  let repos: Repositories;
  let sink: ReturnType<typeof createRecordingSink>;
  let team: Team;
  let member: TeamMember;
  let session: HealthCheckSession;

  const linked: SlackLinkChecker = { async hasSlackLink() { return true; } };

  function build() {
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
      now: () => NOW,
    });
  }

  /** A closed session the member did not respond to. */
  async function seedMissedPreviousSession(): Promise<HealthCheckSession> {
    const previous = await repos.session.create({ teamId: team.id, status: 'closed' });
    return repos.session.update(previous.id, {
      status: 'closed',
      actualCloseAt: new Date(),
    });
  }

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sink = createRecordingSink();
    team = await repos.team.create({ name: 'Nudge Team' });
    member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Dana',
      email: 'dana@example.com',
    });
    session = await repos.session.create({ teamId: team.id, status: 'open' });
  });

  it('nudges an eligible weekly member who missed the previous session', async () => {
    await seedMissedPreviousSession();

    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(true);
    expect(sink.calls).toEqual([`mid_session_nudge:${member.id}`]);
  });

  it('skips a member who has turned reminders off', async () => {
    await seedMissedPreviousSession();
    await repos.teamMember.update(member.id, { remindersEnabled: false });

    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a micro-pulse member, who is prompted daily anyway', async () => {
    await seedMissedPreviousSession();
    await repos.teamMember.update(member.id, { cadencePreference: 'micro_pulse' });

    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a member who is currently marked away', async () => {
    await seedMissedPreviousSession();
    await repos.availability.create({
      memberId: member.id,
      awayFrom: new Date('2027-01-05T00:00:00.000Z'),
      awayUntil: new Date('2027-01-08T00:00:00.000Z'),
    });

    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('skips a member who was away during the previous session', async () => {
    const previous = await seedMissedPreviousSession();
    // Away across the previous session's window, but available again by NOW
    await repos.availability.create({
      memberId: member.id,
      awayFrom: new Date(previous.actualOpenAt.getTime() - 60 * 60 * 1000),
      awayUntil: new Date(previous.actualOpenAt.getTime() + 60 * 60 * 1000),
    });

    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(false);
    expect(sink.calls).toEqual([]);
  });

  it('does not nudge twice from a freshly constructed service', async () => {
    await seedMissedPreviousSession();

    // A new serverless invocation builds a new service; the guard must be durable
    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(true);
    await expect(build().sendMidSessionNudge(member.id, session)).resolves.toBe(false);

    expect(sink.calls).toHaveLength(1);
  });
});
