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

  it('counts the prompts it sent, not the members it considered', async () => {
    /*
     * Requirements: Knowing What Happened 1.5; Remembering What Happened 2.1
     *
     * `prompts` incremented once per member in a team whose check had just
     * opened, regardless of what `sendSlackPrompt` returned — and it returns
     * false for a member with no Slack link, one marked away, or a team outside
     * its delivery window.
     *
     * So the response said "prompting 2 members" while one message was sent,
     * and on a deployment where nobody has linked Slack it claimed to have
     * prompted a whole team while sending nothing at all. The sink assertions
     * above were right the whole time; nothing compared them to the number the
     * response reported.
     *
     * It matters more now than it did: the count decides whether a tick is
     * eventful enough to keep, so a wrong one writes a wrong ledger.
     */
    const team = await seedScheduledTeam('Tick Prompt Count Team');
    const linked = await repos.teamMember.create({
      teamId: team.id,
      name: 'Linked',
      email: 'linked@count.test',
    });
    await repos.teamMember.create({ teamId: team.id, name: 'Unlinked', email: 'unlinked@count.test' });
    await repos.slackIdentityLink.create({ memberId: linked.id, slackUserId: 'U_COUNT_LINKED' });

    const body = (await (await POST(tickRequest())).json()) as { prompts?: number };

    expect(sink.calls).toHaveLength(1);
    expect(body.prompts, 'the count should match what was actually sent').toBe(1);
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

/**
 * What the tick tells the service that called it.
 *
 * Requirements: Knowing What Happened 1.4, 1.5
 *
 * It returned `{ ok: true }` whatever it did. cron-job.org shows the response
 * body of every call it makes — a dashboard the maintainer already has open,
 * refreshed daily — so a check that failed to open looked exactly like a
 * Wednesday.
 */
describe('the tick response', () => {
  // A sibling of the describe above, so it stubs the secret for itself
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('says what it did, not merely that it ran', async () => {
    const response = await POST(tickRequest(), { params: Promise.resolve({}) });
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ ok: true });
    expect(body).toHaveProperty('opened');
    expect(body).toHaveProperty('closed');
    expect(body).toHaveProperty('materialised');
    expect(body).toHaveProperty('prompts');
  });

  it('carries the tick id, so a response ties to the lines it produced', async () => {
    const body = (await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).json()) as { tickId?: string };

    expect(body.tickId).toEqual(expect.any(String));
  });

  it('carries counts and ids only, never anything a member answered', async () => {
    /*
     * The response goes to a third-party service and is displayed in its
     * dashboard. A score in it would leave the product's anonymity promise
     * behind on somebody else's website.
     */
    const body = await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).text();

    expect(body).not.toMatch(/score|trend|improving|declining/i);
  });

  it('is laid out to be read, not packed onto one line', async () => {
    /*
     * Requirements: Knowing What Happened 1.6
     *
     * The body arrives in cron-job.org's job history as a string, and on one
     * line it reads as `{"ok":true,"summary":"Ran, nothing was due: 1 team
     * outside the collection window.","tickId":"r899tibd","opened":0,...}` —
     * better than a variable name and a value, and still something you pick
     * apart rather than read.
     *
     * Indented, the job history renders it across lines — confirmed against
     * the real dashboard on 2026-09-16, tick `polp7zlm`. The change was made
     * on the weaker argument that it could not be worse whichever way their
     * viewer behaved; it did not need the fallback.
     *
     * Still `application/json`, and still parses — the E2E reads `summary`
     * out of it.
     */
    const response = await POST(tickRequest(), { params: Promise.resolve({}) });
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toContain('\n');
    expect(JSON.parse(body)).toMatchObject({ ok: true });
  });

  it('leads with the sentence, since that is the line worth reading', async () => {
    // Key order is what a reader meets first, and JSON preserves it
    const body = await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).text();

    expect(Object.keys(JSON.parse(body) as Record<string, unknown>)[1]).toBe('summary');
  });
});

describe('the proof a tick leaves behind', () => {
  /*
   * Requirements: Remembering What Happened 1.1, 1.3
   * Property: 1
   *
   * The response is read by whoever is looking at the cron dashboard at the
   * time, and cron-job.org keeps the last fifty executions — between fifty
   * minutes and four hours, depending on the interval. The heartbeat is what
   * is still there tomorrow.
   *
   * The quiet case is the one the requirement rests on. A tick that did
   * nothing must still write, or a genuinely quiet week is indistinguishable
   * from a week of not running at all — the exact confusion this whole line of
   * work exists to remove.
   */

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetTickTestDeps();
  });

  it('writes one even when the tick did nothing', async () => {
    /*
     * The criterion the whole requirement rests on, so it is asserted on a
     * heartbeat *this* tick wrote rather than on one being present.
     *
     * The container is module-level and shared across this file, so an earlier
     * test's heartbeat is still there: `not.toBeNull()` passed against an
     * implementation that skipped quiet ticks entirely. Found by mutating that
     * implementation and watching the one test that should have caught it stay
     * green.
     */
    const ranAt = new Date('2026-08-26T03:17:00.000Z');
    _setTickTestDeps({ now: () => ranAt });

    const body = (await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).json()) as { opened: number; closed: number; materialised: number };

    expect(body, 'this tick should have been a quiet one').toMatchObject({
      opened: 0,
      closed: 0,
      materialised: 0,
    });
    expect((await repos.schedulerHeartbeat.latest())?.ranAt.toISOString()).toBe(
      ranAt.toISOString(),
    );
  });

  it('records the time the tick ran, which is what answers "has it stopped?"', async () => {
    const ranAt = new Date('2026-08-24T09:00:00.000Z');
    _setTickTestDeps({ now: () => ranAt });

    await POST(tickRequest(), { params: Promise.resolve({}) });

    expect((await repos.schedulerHeartbeat.latest())?.ranAt.toISOString()).toBe(
      ranAt.toISOString(),
    );
  });

  it('carries the same sentence the response carried', async () => {
    /*
     * One sentence, composed once. If the heartbeat said something different
     * from the response, somebody comparing a cron dashboard against the
     * application would have two accounts of one tick and no way to choose.
     */
    const response = await POST(tickRequest(), { params: Promise.resolve({}) });
    const body = (await response.json()) as { summary?: string };

    expect((await repos.schedulerHeartbeat.latest())?.summary).toBe(body.summary);
  });

  it('carries the same tick id the response carried', async () => {
    const body = (await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).json()) as { tickId?: string };

    expect((await repos.schedulerHeartbeat.latest())?.tickId).toBe(body.tickId);
  });

  it('counts the prompts, which only the route knows', async () => {
    /*
     * The scheduler decides what to open; the route sends the prompts. A
     * heartbeat written inside the service could not report this, which is why
     * it is written here.
     */
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({ name: `Heartbeat Prompts ${Date.now()}`, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const body = (await (
      await POST(tickRequest(), { params: Promise.resolve({}) })
    ).json()) as { prompts?: number };

    expect((await repos.schedulerHeartbeat.latest())?.prompts).toBe(body.prompts);
  });

  it('is replaced by the next tick rather than accumulating', async () => {
    // Asserted here too, at the level the route works at: the point of a
    // heartbeat is that reading it stays one lookup for ever
    const first = new Date('2026-08-24T09:00:00.000Z');
    const second = new Date('2026-08-24T09:05:00.000Z');

    _setTickTestDeps({ now: () => first });
    await POST(tickRequest(), { params: Promise.resolve({}) });
    _setTickTestDeps({ now: () => second });
    await POST(tickRequest(), { params: Promise.resolve({}) });

    expect((await repos.schedulerHeartbeat.latest())?.ranAt.toISOString()).toBe(
      second.toISOString(),
    );
  });

  it('carries no answer content, since it outlives everything else', async () => {
    await POST(tickRequest(), { params: Promise.resolve({}) });

    const written = JSON.stringify(await repos.schedulerHeartbeat.latest());
    expect(written).not.toMatch(/score|trend|improving|declining/i);
  });
});

describe('when the proof cannot be written', () => {
  /*
   * Requirements: Remembering What Happened 1.4, NFR 2.1
   * Property: 4
   *
   * The service swallows its own failure, and this asserts what that is for at
   * the level it matters: the tick still does its work. A rejection would turn
   * a tick that opened a check into a 500, and the cron service would report a
   * failure for work that succeeded.
   */

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    _resetTickTestDeps();
  });

  it('opens the check anyway', async () => {
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({
      name: `Broken Heartbeat ${Date.now()}`,
      timezone: 'UTC',
    });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });
    vi.spyOn(repos.schedulerHeartbeat, 'record').mockRejectedValue(new Error('disk full'));

    const response = await POST(tickRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    // The outcome that matters, read back from the repository rather than
    // inferred from the response the same code path produced
    expect(await repos.session.findOpenByTeamId(team.id)).not.toBeNull();
  });
});

describe('the ticks the ledger keeps', () => {
  /*
   * Requirements: Remembering What Happened 2.1, 2.3, 4.2, 4.3
   * Properties: 2, 3, 6
   *
   * The heartbeat says the scheduler ran. The ledger says what happened on
   * Monday — and only by keeping the ticks that did something, because keeping
   * the recent ones is what leaves fifty "nothing was due" entries and no
   * record of the morning a check opened.
   */

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    _resetTickTestDeps();
  });

  async function ledgerTickIds(): Promise<string[]> {
    return (await repos.schedulerTickRecord.recent(50)).map(row => row.tickId);
  }

  it('keeps a tick that opened a check', async () => {
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({ name: `Ledger Open ${Date.now()}`, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const body = (await (await POST(tickRequest())).json()) as { tickId: string; opened: number };

    expect(body.opened, 'this tick should have opened something').toBeGreaterThan(0);
    expect(await ledgerTickIds()).toContain(body.tickId);
  });

  it('keeps nothing from a tick that did nothing', async () => {
    /*
     * The eviction problem, asserted. A quiet tick has nothing to add that the
     * heartbeat has not already said, and writing it is what pushes the
     * interesting ones out.
     *
     * Asserted on this tick's own id rather than on the ledger being empty:
     * the container is module-level and shared across this file, so an earlier
     * test's rows are still there.
     */
    _setTickTestDeps({ now: () => new Date('2026-08-26T04:11:00.000Z') });

    const body = (await (await POST(tickRequest())).json()) as {
      tickId: string;
      opened: number;
      closed: number;
      materialised: number;
      prompts: number;
    };

    expect(body, 'this tick should have been a quiet one').toMatchObject({
      opened: 0,
      closed: 0,
      materialised: 0,
      prompts: 0,
    });
    expect(await ledgerTickIds()).not.toContain(body.tickId);
  });

  it('keeps one row, not one per thing that happened', async () => {
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({ name: `Ledger Once ${Date.now()}`, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const body = (await (await POST(tickRequest())).json()) as { tickId: string };

    expect((await ledgerTickIds()).filter(id => id === body.tickId)).toHaveLength(1);
  });

  it('carries the same sentence and reasons the response carried', async () => {
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({ name: `Ledger Says ${Date.now()}`, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const body = (await (await POST(tickRequest())).json()) as {
      tickId: string;
      summary: string;
      reasons: Record<string, number>;
    };

    const kept = (await repos.schedulerTickRecord.recent(50)).find(
      row => row.tickId === body.tickId,
    );
    expect(kept?.summary).toBe(body.summary);
    expect(kept?.reasons).toEqual(body.reasons);
  });

  it('never fails the tick when the ledger cannot be written', async () => {
    // Same trade as the heartbeat: forgetting is better than not working
    const sink = createRecordingSink();
    _setTickTestDeps({ notificationSink: sink, now: () => OPEN_TICK });
    const team = await repos.team.create({ name: `Ledger Broken ${Date.now()}`, timezone: 'UTC' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });
    vi.spyOn(repos.schedulerTickRecord, 'append').mockRejectedValue(new Error('disk full'));

    const response = await POST(tickRequest());

    expect(response.status).toBe(200);
    expect(await repos.session.findOpenByTeamId(team.id)).not.toBeNull();
  });
});
