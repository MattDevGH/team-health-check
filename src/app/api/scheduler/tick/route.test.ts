/**
 * Tests for POST /api/scheduler/tick — notification wiring.
 *
 * These drive the exported handler rather than reproducing its orchestration,
 * so the route's own wiring and eligibility delegation are under test.
 *
 * Requirements: 3.2, 3.3, 8.1, 8.2, 8.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { POST, _setTickTestDeps, _resetTickTestDeps } from './route';
import { repos } from '@/lib/container-production';
import { encodeQueuedDelivery } from '@/lib/slack/queued-delivery';
import type { InMemoryInteractionQueueRepository } from '@/lib/repositories/in-memory/interaction-queue.repository';
import type { NotificationSink } from '@/lib/services/notification.service';
import type { Team } from '@/lib/repositories/entities';

const CRON_SECRET = 'test-cron-secret';

/** Monday 09:00 UTC — matches the schedule seeded below, so a session opens. */
const OPEN_TICK = new Date('2026-08-24T09:00:00.000Z');

function createRecordingSink(): NotificationSink & {
  calls: Array<{ memberId: string; type: string }>;
} {
  const calls: Array<{ memberId: string; type: string }> = [];
  return {
    calls,
    async send(memberId: string, type: string): Promise<void> {
      calls.push({ memberId, type });
    },
  };
}

/** The in-memory queue exposes every entry regardless of status, for assertions. */
function queueEntries() {
  return (repos.interactionQueue as InMemoryInteractionQueueRepository).getAll();
}

function tickRequest(secret = CRON_SECRET): Request {
  return new Request('http://localhost/api/scheduler/tick', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('POST /api/scheduler/tick', () => {
  let sink: ReturnType<typeof createRecordingSink>;

  /** Seeds a team whose schedule opens Monday 09:00 and closes Friday 17:00 UTC. */
  async function seedScheduledTeam(name: string): Promise<Team> {
    const team = await repos.team.create({ name, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });
    return team;
  }

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
    sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
  });

  afterEach(() => {
    _resetTickTestDeps();
    vi.unstubAllEnvs();
  });

  it('rejects a request without the cron secret', async () => {
    const res = await POST(tickRequest('wrong-secret'));

    expect(res.status).toBe(403);
  });

  it('opens a due session and prompts its Slack-linked members', async () => {
    const team = await seedScheduledTeam('Tick Prompt Team');
    const linked = await repos.teamMember.create({
      teamId: team.id,
      name: 'Alice',
      email: 'alice@tick.test',
    });
    await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'bob@tick.test' });
    await repos.slackIdentityLink.create({ memberId: linked.id, slackUserId: 'U_TICK_ALICE' });

    const res = await POST(tickRequest());

    expect(res.status).toBe(200);

    // The tick opened the session
    const session = await repos.session.findOpenByTeamId(team.id);
    expect(session).not.toBeNull();

    // Only the linked member was prompted (Bob has no Slack link)
    expect(sink.calls).toEqual([{ memberId: linked.id, type: 'slack_prompt' }]);
  });

  it('does not prompt a member who is marked away', async () => {
    const team = await seedScheduledTeam('Tick Away Team');
    const present = await repos.teamMember.create({
      teamId: team.id,
      name: 'Present',
      email: 'present@tick.test',
    });
    const away = await repos.teamMember.create({
      teamId: team.id,
      name: 'Away',
      email: 'away@tick.test',
    });
    await repos.slackIdentityLink.create({ memberId: present.id, slackUserId: 'U_TICK_PRESENT' });
    await repos.slackIdentityLink.create({ memberId: away.id, slackUserId: 'U_TICK_AWAY' });
    await repos.availability.create({
      memberId: away.id,
      awayFrom: new Date('2026-08-23T00:00:00.000Z'),
      awayUntil: new Date('2026-08-26T00:00:00.000Z'),
    });

    const res = await POST(tickRequest());

    expect(res.status).toBe(200);
    expect(sink.calls).toEqual([{ memberId: present.id, type: 'slack_prompt' }]);
  });

  it('sends no prompts when no session is due to open', async () => {
    const team = await repos.team.create({ name: 'Tick Idle Team', timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      // Opens Wednesday, so a Monday tick does nothing
      openDay: 3,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Idle',
      email: 'idle@tick.test',
    });
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId: 'U_TICK_IDLE' });

    const res = await POST(tickRequest());

    expect(res.status).toBe(200);
    expect(await repos.session.findOpenByTeamId(team.id)).toBeNull();
    expect(sink.calls).toEqual([]);
  });

  it('reminds members once the session close is inside the lead window', async () => {
    const team = await seedScheduledTeam('Tick Reminder Team');
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Reminded',
      email: 'reminded@tick.test',
    });
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId: 'U_TICK_REMIND' });

    // Opening tick — prompts, but the Friday 17:00 close is still four days out
    await POST(tickRequest());
    expect(sink.calls.map(call => call.type)).toEqual(['slack_prompt']);

    // A later tick, 23 hours before close, is inside the default 24h lead window
    _setTickTestDeps({
      notificationSink: sink,
      now: () => new Date('2026-08-27T18:00:00.000Z'),
    });
    const res = await POST(tickRequest());

    expect(res.status).toBe(200);
    expect(sink.calls).toContainEqual({ memberId: member.id, type: 'closing_reminder' });
  });

  it('reminds on the tick clock, not the wall clock', async () => {
    // A tick must run on one clock. The session service used to compute
    // scheduledCloseAt from the real clock while the scheduler and the
    // notification service ran on the injected one, so whether this scenario
    // passed depended on the day and hour the suite happened to run: before
    // Friday 17:00 UTC the close was hours away and the reminder fired; after
    // it, the close rolled a week forward and it did not.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-05T08:00:00.000Z'));

    try {
      const team = await seedScheduledTeam('Tick Wall Clock Team');
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Wall Clock',
        email: 'wall-clock@tick.test',
      });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'U_TICK_WALL_CLOCK',
      });

      await POST(tickRequest());

      const session = await repos.session.findOpenByTeamId(team.id);
      // The Friday after the tick clock's Monday, not the Friday after today
      expect(session?.scheduledCloseAt).toEqual(new Date('2026-08-28T17:00:00.000Z'));

      _setTickTestDeps({
        notificationSink: sink,
        now: () => new Date('2026-08-27T18:00:00.000Z'),
      });
      await POST(tickRequest());

      expect(sink.calls).toContainEqual({ memberId: member.id, type: 'closing_reminder' });
    } finally {
      vi.useRealTimers();
    }
  });

  describe('Slack retry queue draining (Requirement 8.5)', () => {
    it('replays a queued delivery on a later tick and marks it delivered', async () => {
      const queued = await repos.interactionQueue.add({
        interactionPayload: encodeQueuedDelivery({
          kind: 'dm',
          memberId: 'queued-member',
          slackUserId: 'U_QUEUED',
          blocks: [{ type: 'section' }],
        }),
        responseUrl: '',
        failureReason: 'channel_not_found',
      });

      // Entries are enqueued against the real clock, so drain after that instant
      const drainAt = new Date(Date.now() + 60_000);
      const attempts: string[] = [];
      _setTickTestDeps({
        notificationSink: sink,
        now: () => drainAt,
        queueDeliver: async (_responseUrl, payload) => {
          attempts.push(payload);
          return true;
        },
      });

      const res = await POST(tickRequest());

      expect(res.status).toBe(200);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toContain('U_QUEUED');

      // Entry is settled, so a further tick does not replay it
      const stillPending = await repos.interactionQueue.findPending(drainAt);
      expect(stillPending.map(entry => entry.id)).not.toContain(queued.id);
    });

    it('backs off a failed replay instead of retrying it immediately', async () => {
      const queued = await repos.interactionQueue.add({
        interactionPayload: encodeQueuedDelivery({
          kind: 'response_url',
          responseUrl: 'https://hooks.slack.com/actions/T1/1/x',
          text: 'Recorded 4',
        }),
        responseUrl: 'https://hooks.slack.com/actions/T1/1/x',
        failureReason: 'timeout',
      });

      const drainAt = new Date(Date.now() + 60_000);
      let attempts = 0;
      _setTickTestDeps({
        notificationSink: sink,
        now: () => drainAt,
        queueDeliver: async () => {
          attempts++;
          return false;
        },
      });

      await POST(tickRequest());
      // A second tick at the same instant must not retry — backoff has not elapsed
      await POST(tickRequest());

      expect(attempts).toBe(1);

      const entry = queueEntries().find(e => e.id === queued.id);
      expect(entry?.retryCount).toBe(1);
      expect(entry?.status).toBe('pending');
      expect(entry?.nextRetryAt?.getTime()).toBeGreaterThan(drainAt.getTime());
    });

    it('gives up on an entry that has exhausted its retries', async () => {
      const queued = await repos.interactionQueue.add({
        interactionPayload: encodeQueuedDelivery({
          kind: 'dm',
          memberId: 'doomed-member',
          slackUserId: 'U_DOOMED',
          blocks: [],
        }),
        responseUrl: '',
        failureReason: 'account_inactive',
      });
      for (let i = 0; i < 5; i++) {
        await repos.interactionQueue.incrementRetry(queued.id, OPEN_TICK, 'Delivery failed');
      }

      let attempts = 0;
      _setTickTestDeps({
        notificationSink: sink,
        now: () => OPEN_TICK,
        queueDeliver: async () => {
          attempts++;
          return false;
        },
      });

      await POST(tickRequest());

      expect(attempts).toBe(0);
      const entry = queueEntries().find(e => e.id === queued.id);
      expect(entry?.status).toBe('failed');
      expect(entry?.failureReason).toBe('Max retries exhausted');
    });
  });

  it('does not repeat the closing reminder on subsequent ticks', async () => {
    const team = await seedScheduledTeam('Tick Repeat Team');
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Once',
      email: 'once@tick.test',
    });
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId: 'U_TICK_ONCE' });

    await POST(tickRequest());

    for (const hour of ['18:00', '19:00', '20:00']) {
      _setTickTestDeps({
        notificationSink: sink,
        now: () => new Date(`2026-08-27T${hour}:00.000Z`),
      });
      await POST(tickRequest());
    }

    const reminders = sink.calls.filter(call => call.type === 'closing_reminder');
    expect(reminders).toHaveLength(1);
  });
});
