/**
 * What the scheduler says it did.
 *
 * Requirements: Knowing What Happened 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 * Properties: 1 (an event names what it is about), 4 (a tick's events share its id)
 *
 * The tick opens checks, closes them, computes their results and sends every
 * prompt, and recorded none of it. The cron service that calls it daily received
 * a 200 and nothing else, so "why did no check open on Monday?" could only be
 * answered by reasoning about code that had already run.
 *
 * The decisions are the interesting part. A tick that opens nothing is the
 * normal case six days a week, and is indistinguishable from a broken one unless
 * it says *why* it opened nothing.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createSessionService, type SessionService } from '@/lib/services/session.service';
import { createSchedulerService } from '@/lib/services/scheduler.service';
import { createRecorder } from '@/lib/observability';

const MONDAY_0900 = new Date('2026-09-14T09:00:00.000Z');
const WEDNESDAY = new Date('2026-09-16T09:00:00.000Z');
/** Past the Friday 17:00 close, so the check is due to end. */
const FRIDAY_AFTER_CLOSE = new Date('2026-09-18T18:00:00.000Z');
/** Outside the Monday-to-Friday window entirely. */
const SATURDAY = new Date('2026-09-19T12:00:00.000Z');

let repos: Repositories;
let sessionService: SessionService;
let events: Record<string, unknown>[];
let scheduler: ReturnType<typeof createSchedulerService>;

/**
 * Where the session service thinks it is, which the tick sets before it runs.
 *
 * Injected rather than left to the wall clock, and that is a fix rather than a
 * tidy-up: four tests here failed for the first time on 2026-09-18 at 17:00
 * UTC, having passed since they were written. `sessionService.open` stamps
 * `scheduledCloseAt` from its own clock, so on a Friday evening the next
 * Friday 17:00 it could find was a **week** after the date the tick was given —
 * nothing was due to close, and the four tests about closing and materialising
 * had nothing to assert on.
 *
 * A test whose result depends on the day it runs is not evidence about the
 * code. This one was green for months and would have gone green again by
 * itself the following morning, which is the worst version of the problem.
 *
 * Injecting the clock here was only half of it, and three of the four failed
 * again the next day: `close` and the supersede-on-open path were writing
 * `actualCloseAt` with `new Date()` while everything else used the injected
 * clock, so the tick was comparing two different clocks. That is fixed in the
 * service, and pinned by `session-service-clock.test.ts`.
 */
let serviceClock = new Date(0);

/**
 * Runs a tick with the service clock set a minute behind it.
 *
 * A minute rather than zero because the rows a tick reads were written before
 * it started: closing stamps `actualCloseAt`, and materialising asks whether
 * the quiet period since that stamp has elapsed. With both taken from the same
 * instant the answer is always "no", which is true of no real deployment.
 */
async function tickAt(when: Date) {
  serviceClock = new Date(when.getTime() - 60_000);
  return scheduler.tick(when);
}

beforeEach(() => {
  repos = createInMemoryRepositories();
  sessionService = createSessionService({
    sessionRepo: repos.session,
    sessionLinkRepo: repos.sessionLink,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    sessionAggregateRepo: repos.sessionAggregate,
    teamScheduleRepo: repos.teamSchedule,
    now: () => serviceClock,
  });

  events = [];
  scheduler = createSchedulerService({
    teamRepo: repos.team,
    teamScheduleRepo: repos.teamSchedule,
    sessionRepo: repos.session,
    sessionService,
    recorder: createRecorder({
      sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
    }),
  });
});

/** A team whose check opens Monday 09:00 and closes Friday 17:00. */
async function teamWithSchedule(name = 'Squad') {
  const team = await repos.team.create({ name });
  await repos.teamSchedule.create({
    teamId: team.id,
    cadence: 'weekly',
    openDay: 1,
    openTime: '09:00',
    closeDay: 5,
    closeTime: '17:00',
    timezone: 'UTC',
  });
  await repos.teamMember.create({ teamId: team.id, name: 'M', email: 'm@example.invalid' });
  return team;
}

const named = (event: string) => events.filter(e => e.event === event);

describe('what a tick records', () => {
  it('says it ran, and how long it took', async () => {
    // A tick that never started and a tick that did nothing look identical
    // from outside, and only one of them is a problem
    await teamWithSchedule();

    await tickAt(MONDAY_0900);

    expect(named('tick.started')).toHaveLength(1);
    expect(named('tick.finished')[0]).toHaveProperty('durationMs');
  });

  it('names the team and session it opened', async () => {
    const team = await teamWithSchedule();

    await tickAt(MONDAY_0900);

    const opened = named('session.opened')[0];
    expect(opened).toMatchObject({ teamId: team.id });
    expect(opened.sessionId).toEqual(expect.any(String));
  });

  it('names the team and session it closed', async () => {
    const team = await teamWithSchedule();
    await tickAt(MONDAY_0900);
    events.length = 0;

    await tickAt(FRIDAY_AFTER_CLOSE);

    expect(named('session.closed')[0]).toMatchObject({ teamId: team.id });
  });

  it('names the session it materialised', async () => {
    /*
     * In the same tick as the close, because `tickAt` puts the service clock a
     * minute behind the tick: the close stamps `actualCloseAt` a minute ago and
     * the quiet period has therefore elapsed by the time materialisation is
     * considered. Against a real database this would be the following tick,
     * and the record is the same either way.
     *
     * It used to rely on the wall clock being years from the fixture dates,
     * which stopped being true on 2026-09-18.
     */
    await teamWithSchedule();
    await tickAt(MONDAY_0900);
    events.length = 0;

    await tickAt(FRIDAY_AFTER_CLOSE);

    expect(named('session.materialised')[0].sessionId).toEqual(expect.any(String));
  });

  it('says why it passed over a team with no schedule', async () => {
    /*
     * The case that makes the whole record worth having. A tick that opens
     * nothing is the normal state six days a week; without a reason it is
     * indistinguishable from a broken one.
     */
    await repos.team.create({ name: 'Unscheduled' });

    await tickAt(MONDAY_0900);

    expect(named('tick.skipped')[0]).toMatchObject({ reason: 'no schedule configured' });
  });

  it('says why it passed over an archived team', async () => {
    const team = await repos.team.create({ name: 'Archived' });
    await repos.team.update(team.id, { archived: true });

    await tickAt(MONDAY_0900);

    expect(named('tick.skipped')[0]).toMatchObject({
      teamId: team.id,
      reason: 'team archived',
    });
  });

  it('distinguishes being outside the window from having no schedule', async () => {
    // Two different silences. Reporting them the same way would be the same
    // defect the dashboard's "overdue" state exists to fix
    await teamWithSchedule();

    await tickAt(SATURDAY);

    expect(named('tick.skipped')[0].reason).toMatch(/collection window/i);
  });

  it('says when a cycle has already been served', async () => {
    /*
     * A manager closing early, which is the only way to be inside the window
     * with the cycle already served: past the scheduled close the window is
     * gone, and the reason becomes that instead.
     */
    const team = await teamWithSchedule();
    await tickAt(MONDAY_0900);
    const open = await repos.session.findOpenByTeamId(team.id);
    await sessionService.close(team.id, open!.id);
    events.length = 0;

    await tickAt(WEDNESDAY);

    expect(named('tick.skipped')[0].reason).toMatch(/already been served/i);
  });

  it('says a check is already collecting rather than inventing another reason', async () => {
    await teamWithSchedule();
    await tickAt(MONDAY_0900);
    events.length = 0;

    await tickAt(new Date('2026-09-15T09:00:00.000Z'));

    expect(named('tick.skipped')[0].reason).toMatch(/already collecting/i);
  });

  it('gives every event from one tick the same tick id', async () => {
    /*
     * Property 4. Two ticks a minute apart interleave in a log, and without
     * this there is no way to read one run as a run.
     */
    await teamWithSchedule();
    await repos.team.create({ name: 'Unscheduled' });

    await tickAt(MONDAY_0900);

    const ids = new Set(events.map(e => e.tickId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toEqual(expect.any(String));
  });

  it('gives a second tick a different id', async () => {
    await teamWithSchedule();

    await tickAt(MONDAY_0900);
    const first = events[0].tickId;
    events.length = 0;
    await tickAt(new Date('2026-09-15T09:00:00.000Z'));

    expect(events[0].tickId).not.toBe(first);
  });

  it('records a materialisation that failed, which used to vanish', async () => {
    /*
     * The failure was swallowed with a comment saying it would be retried next
     * tick. It is retried — for ever, silently, if the cause is permanent.
     */
    await teamWithSchedule();
    await tickAt(MONDAY_0900);
    events.length = 0;

    const failing = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService: {
        ...sessionService,
        materializeAggregates: async () => {
          throw new Error('aggregate write refused');
        },
      },
      recorder: createRecorder({
        sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
      }),
    });

    await failing.tick(FRIDAY_AFTER_CLOSE);

    expect(named('session.materialise.failed')[0]).toMatchObject({ level: 'error' });
  });
});

describe('what a tick returns', () => {
  it('counts what it did, for the cron service that shows the response', async () => {
    await teamWithSchedule();

    const summary = await tickAt(MONDAY_0900);

    expect(summary).toMatchObject({ opened: 1, closed: 0, materialised: 0 });
  });

  it('carries the tick id, so a response ties to the lines it produced', async () => {
    await teamWithSchedule();

    const summary = await tickAt(MONDAY_0900);

    expect(summary.tickId).toBe(events[0].tickId);
  });

  it('counts a close and a materialisation', async () => {
    await teamWithSchedule();
    await tickAt(MONDAY_0900);

    const closing = await tickAt(FRIDAY_AFTER_CLOSE);

    expect(closing.closed).toBe(1);
    expect(closing.materialised).toBe(1);
  });

  it('reports zeroes for a quiet tick rather than nothing at all', async () => {
    /*
     * "Nothing happened" is an answer; an empty response is not. A Saturday,
     * because a Wednesday is inside a Monday-to-Friday window and a check would
     * open — which is itself worth knowing about the schedule.
     */
    await teamWithSchedule();

    const summary = await tickAt(SATURDAY);

    expect(summary).toMatchObject({ opened: 0, closed: 0, materialised: 0 });
  });
});

describe('the reasons a tick passed a team over', () => {
  /*
   * Requirements: Knowing What Happened 1.6
   *
   * The reasons were recorded and then thrown away: they reached the server
   * log, which nobody reads on a schedule, and not the response, which is the
   * one thing the cron service puts in front of a person. Counting them here
   * is what lets the response say why nothing opened.
   */

  it('says why, when it opened nothing', async () => {
    const team = await repos.team.create({ name: "Unscheduled" });
    await repos.teamMember.create({ teamId: team.id, name: "M", email: "m@example.invalid" });

    const summary = await tickAt(MONDAY_0900);

    expect(summary.reasons).toEqual({ 'no schedule configured': 1 });
  });

  it('counts the teams a reason applied to, rather than listing them', async () => {
    // The teams are in the records, named individually. The summary is a
    // shape of the system, and two teams with no schedule is one fact
    for (const name of ["A", "B"]) {
      const team = await repos.team.create({ name });
      await repos.teamMember.create({ teamId: team.id, name: "M", email: `${name}@example.invalid` });
    }

    const summary = await tickAt(MONDAY_0900);

    expect(summary.reasons['no schedule configured']).toBe(2);
  });

  it('tells the reasons apart', async () => {
    await teamWithSchedule("Scheduled");
    const archived = await repos.team.create({ name: "Gone" });
    await repos.team.update(archived.id, { archived: true });

    const summary = await tickAt(SATURDAY);

    expect(summary.reasons).toMatchObject({
      'team archived': 1,
      'outside the collection window': 1,
    });
  });

  it('carries nothing when every team was acted on', async () => {
    await teamWithSchedule();

    const summary = await tickAt(MONDAY_0900);

    expect(summary.reasons).toEqual({});
  });

  it('counts every reason the tick records, not a hand-picked few', async () => {
    /*
     * The failure this guards against is a new skip reason being added to the
     * tick and quietly never reaching the response — the count drifting from
     * the records without anything going red. So the two are compared.
     */
    await teamWithSchedule("Scheduled");
    const archived = await repos.team.create({ name: "Gone" });
    await repos.team.update(archived.id, { archived: true });
    const bare = await repos.team.create({ name: "Unscheduled" });
    await repos.teamMember.create({ teamId: bare.id, name: "M", email: "b@example.invalid" });

    const summary = await tickAt(SATURDAY);

    const recorded: Record<string, number> = {};
    for (const skip of named('tick.skipped')) {
      const reason = String(skip.reason);
      recorded[reason] = (recorded[reason] ?? 0) + 1;
    }
    expect(summary.reasons).toEqual(recorded);
  });
});

describe('what a tick failed to do', () => {
  /*
   * Requirements: Remembering What Happened 2.2
   *
   * A materialisation that throws is recorded and retried on the next tick —
   * for ever, if the cause is permanent. The summary said nothing about it, so
   * a tick that opened nothing, closed nothing and failed to compute a result
   * reported the same counts as a quiet Wednesday.
   *
   * That tick is the most interesting one the scheduler can have, and the
   * ledger has to be able to tell it apart from a tick where nothing was due.
   */

  /** A session closed long enough ago to be due for materialisation. */
  async function closedSessionDueForResults() {
    const team = await teamWithSchedule('Failing Materialise');
    const session = await repos.session.create({
      teamId: team.id,
      status: 'open',
      scheduledOpenAt: MONDAY_0900,
    });
    await repos.session.update(session.id, {
      status: 'closed',
      actualCloseAt: new Date(FRIDAY_AFTER_CLOSE.getTime() - 60_000),
    });
    return session;
  }

  it('reports nothing failed when nothing did', async () => {
    await teamWithSchedule();

    expect((await tickAt(MONDAY_0900)).failures).toBe(0);
  });

  it('counts a materialisation that threw', async () => {
    await closedSessionDueForResults();
    const failing = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService: {
        ...sessionService,
        materializeAggregates: async () => {
          throw new Error('aggregate write refused');
        },
      },
    });

    expect((await failing.tick(FRIDAY_AFTER_CLOSE)).failures).toBe(1);
  });

  it('counts it even though every other count stays zero', async () => {
    /*
     * The case a count-based rule gets wrong. Nothing opened, nothing closed,
     * nothing materialised — and that is exactly why this tick matters.
     */
    await closedSessionDueForResults();
    const failing = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService: {
        ...sessionService,
        materializeAggregates: async () => {
          throw new Error('aggregate write refused');
        },
      },
    });

    const summary = await failing.tick(FRIDAY_AFTER_CLOSE);

    expect(summary).toMatchObject({ opened: 0, closed: 0, materialised: 0, failures: 1 });
  });

  it('agrees with the failures it recorded', async () => {
    // The same guard the skip reasons have: a failure that is recorded without
    // being counted would never reach the ledger, and nothing would go red
    await closedSessionDueForResults();
    const failing = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService: {
        ...sessionService,
        materializeAggregates: async () => {
          throw new Error('aggregate write refused');
        },
      },
      recorder: createRecorder({
        sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
      }),
    });

    const summary = await failing.tick(FRIDAY_AFTER_CLOSE);

    expect(summary.failures).toBe(named('session.materialise.failed').length);
  });
});

describe('a scheduler given no recorder', () => {
  it('still works, so nothing is forced to wire one up', async () => {
    /*
     * The service is used in tests and scripts that have no interest in
     * records, and a required dependency would make every one of them carry a
     * recorder to do nothing with.
     */
    const quiet = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService,
    });
    await teamWithSchedule();

    const summary = await quiet.tick(MONDAY_0900);

    expect(summary.opened).toBe(1);
  });
});
