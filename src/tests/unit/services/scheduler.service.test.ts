import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createSessionService, type SessionService } from '@/lib/services/session.service';
import { createSchedulerService } from '@/lib/services/scheduler.service';

describe('SchedulerService.tick', () => {
  let repos: Repositories;
  let sessionService: SessionService;
  let scheduler: ReturnType<typeof createSchedulerService>;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
      // Without this, open() has no schedule to read and stamps no
      // scheduledCloseAt — so every close test here ran against a session that
      // had no close time, and passed only because the old comparison ignored
      // the session and looked at the clock.
      teamScheduleRepo: repos.teamSchedule,
    });
    scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService,
    });
  });

  it('opens a session when schedule says it should open', async () => {
    // Create a team with a schedule: opens Monday 09:00 UTC, closes Friday 17:00 UTC
    const team = await repos.team.create({ name: 'Team A', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'alice@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1, // Monday
      openTime: '09:00',
      closeDay: 5, // Friday
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Simulate "now" being Monday 09:00 UTC
    // 2024-01-08 is a Monday
    const now = new Date('2024-01-08T09:00:00.000Z');
    await scheduler.tick(now);

    const openSession = await repos.session.findOpenByTeamId(team.id);
    expect(openSession).not.toBeNull();
    expect(openSession!.status).toBe('open');
    expect(openSession!.teamId).toBe(team.id);
  });

  it('closes a session when schedule says it should close', async () => {
    const team = await repos.team.create({ name: 'Team B', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'bob@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1, // Monday
      openTime: '09:00',
      closeDay: 5, // Friday
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // First open a session
    const session = await sessionService.open(team.id, 'system');

    /*
     * Tick just after this session’s own close time.
     *
     * This used to tick at a fixed Friday in 2024 while the session was opened
     * at the real current time — years apart, and it passed, because the old
     * comparison only asked whether the clock read Friday 17:00. It would have
     * closed a session opened at any point in history. Now that closing reads
     * the session’s stored close time, the fixture has to describe a coherent
     * sequence of events.
     */
    const closesAt = session.scheduledCloseAt!;
    await scheduler.tick(new Date(closesAt.getTime() + 60_000));

    const updated = await repos.session.findById(session.id);
    expect(updated!.status).toBe('closed');
    expect(updated!.actualCloseAt).not.toBeNull();
  });

  it('is idempotent — calling twice does not create duplicate sessions', async () => {
    const team = await repos.team.create({ name: 'Team C', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Charlie', email: 'charlie@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Monday 09:00
    const now = new Date('2024-01-08T09:00:00.000Z');
    await scheduler.tick(now);
    await scheduler.tick(now);

    const sessions = await repos.session.findByTeamId(team.id);
    const openSessions = sessions.filter(s => s.status === 'open');
    expect(openSessions).toHaveLength(1);
  });

  it('materialises aggregates for sessions closed >30s ago', async () => {
    const team = await repos.team.create({ name: 'Team D', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Diana', email: 'diana@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Create and close a session manually, then add responses
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.response.upsert({
      memberId: 'm1',
      sessionId: session.id,
      questionId: 'q1',
      score: 4,
    });

    // Close it with a time >30s in the past
    const closeTime = new Date(Date.now() - 60_000); // 60s ago
    await repos.session.update(session.id, {
      status: 'closed',
      actualCloseAt: closeTime,
    });

    // Run tick — should materialise aggregates
    const now = new Date();
    await scheduler.tick(now);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    expect(aggregates.length).toBeGreaterThan(0);
    expect(aggregates[0].questionId).toBe('q1');
    expect(aggregates[0].averageScore).toBe(4.0);
  });

  it('does not materialise for sessions closed <30s ago', async () => {
    const team = await repos.team.create({ name: 'Team E', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Eve', email: 'eve@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Create and close a session just now (within 30s)
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.response.upsert({
      memberId: 'm1',
      sessionId: session.id,
      questionId: 'q1',
      score: 3,
    });

    const closeTime = new Date(Date.now() - 5_000); // 5s ago (within quiet period)
    await repos.session.update(session.id, {
      status: 'closed',
      actualCloseAt: closeTime,
    });

    const now = new Date();
    await scheduler.tick(now);

    const aggregates = await repos.sessionAggregate.findBySessionId(session.id);
    expect(aggregates).toHaveLength(0);
  });

  it('does not open sessions for archived teams', async () => {
    const team = await repos.team.create({ name: 'Archived Team', timezone: 'UTC' });
    await repos.team.update(team.id, { archived: true });
    await repos.teamMember.create({ teamId: team.id, name: 'Frank', email: 'frank@example.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    const now = new Date('2024-01-08T09:00:00.000Z'); // Monday 09:00
    await scheduler.tick(now);

    const openSession = await repos.session.findOpenByTeamId(team.id);
    expect(openSession).toBeNull();
  });

  it('does not open sessions for teams without schedules', async () => {
    const team = await repos.team.create({ name: 'No Schedule Team', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Grace', email: 'grace@example.com' });
    // No schedule created

    const now = new Date('2024-01-08T09:00:00.000Z');
    await scheduler.tick(now);

    const openSession = await repos.session.findOpenByTeamId(team.id);
    expect(openSession).toBeNull();
  });

  it('does not re-materialise aggregates for sessions that already have them (idempotent)', async () => {
    const team = await repos.team.create({ name: 'Team F', timezone: 'UTC' });
    await repos.teamMember.create({ teamId: team.id, name: 'Frank', email: 'frank@test.com' });
    await repos.teamSchedule.create({
      teamId: team.id,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone: 'UTC',
    });

    // Create and close a session, add a response
    const session = await repos.session.create({ teamId: team.id, status: 'open' });
    await repos.response.upsert({
      memberId: 'm1',
      sessionId: session.id,
      questionId: 'q1',
      score: 5,
    });

    const closeTime = new Date(Date.now() - 60_000); // 60s ago
    await repos.session.update(session.id, {
      status: 'closed',
      actualCloseAt: closeTime,
    });

    // First tick materialises aggregates
    await scheduler.tick(new Date());

    const firstAggregates = await repos.sessionAggregate.findBySessionId(session.id);
    expect(firstAggregates).toHaveLength(1);
    expect(firstAggregates[0].averageScore).toBe(5.0);

    // Add another response after materialisation (simulates late data)
    await repos.response.upsert({
      memberId: 'm2',
      sessionId: session.id,
      questionId: 'q1',
      score: 1,
    });

    // Second tick should NOT re-materialise (aggregates already exist)
    await scheduler.tick(new Date());

    const secondAggregates = await repos.sessionAggregate.findBySessionId(session.id);
    // Still only 1 aggregate record — not re-computed
    expect(secondAggregates).toHaveLength(1);
    expect(secondAggregates[0].averageScore).toBe(5.0); // original value preserved
  });
});

/**
 * The tick must act on state, not on the clock reading a particular minute.
 *
 * Requirements: Deployment 4.1, 4.3, 4.4
 *
 * The scheduler compared `getLocalDayAndTime(now).time` to `schedule.openTime`
 * as strings. A tick one minute late opened nothing; a full day of five-minute
 * ticks opened nothing at all — no error, no retry, because there is nothing
 * exceptional about "the time is not 09:00".
 *
 * That was invisible in tests, which hand `tick` the exact minute, and invisible
 * in production, where a check that never opens looks like a team that was never
 * prompted. It was found by asking what an external cron every five minutes
 * would actually do.
 *
 * The deployment spec claimed the tick "reconciles state, so a missed trigger
 * costs a delay rather than a lost session". Materialisation does. Opening and
 * closing did not.
 */
describe('SchedulerService.tick acts on state, not on the minute', () => {
  let repos: Repositories;
  let sessionService: SessionService;
  let scheduler: ReturnType<typeof createSchedulerService>;
  let teamId: string;

  /** Monday 09:00 open, Friday 17:00 close, UTC. */
  async function seedSchedule() {
    const team = await repos.team.create({ name: 'Level', timezone: 'UTC' });
    teamId = team.id;
    await repos.teamMember.create({ teamId, name: 'Alice', email: 'a@e.test' });
    await repos.teamSchedule.create({
      teamId, cadence: 'weekly',
      openDay: 1, openTime: '09:00', closeDay: 5, closeTime: '17:00', timezone: 'UTC',
    });
  }

  /**
   * One tick, one clock — the same wiring the production route uses.
   *
   * `sessionService.open` stamps `scheduledCloseAt` from its own clock. Built
   * without one it uses the wall clock, so a session opened by a tick dated
   * 2026-09-14 would carry a close time computed from whenever the suite
   * happened to run — which is how the tick route came to run on two clocks
   * once before.
   */
  let clockNow = new Date();
  const tickAt = async (iso: string) => {
    clockNow = new Date(iso);
    await scheduler.tick(clockNow);
  };

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
      teamScheduleRepo: repos.teamSchedule,
      now: () => clockNow,
    });
    scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService,
    });
    await seedSchedule();
  });

  it('opens when the tick is a minute late', async () => {
    await tickAt('2026-09-14T09:01:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).not.toBeNull();
  });

  it('opens when the first tick of the day lands well after the open time', async () => {
    // A five-minute cron that never lands on :00, which is the ordinary case
    await tickAt('2026-09-14T09:02:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).not.toBeNull();
  });

  it('opens exactly once across a run of ticks', async () => {
    // The property that makes an external trigger safe: repeated calls
    // converge on one session rather than one per tick
    for (const at of ['09:02', '09:07', '09:12', '09:17', '10:00', '14:30']) {
      await tickAt(`2026-09-14T${at}:00Z`);
    }

    const sessions = await repos.session.findByTeamId(teamId);
    expect(sessions.filter(s => s.status === 'open')).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });

  it('still opens on a tick that lands exactly on the minute', async () => {
    await tickAt('2026-09-14T09:00:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).not.toBeNull();
  });

  it('does not open before the cycle has begun', async () => {
    // Monday 08:00 — this week's check is still ahead
    await tickAt('2026-09-14T08:00:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).toBeNull();
  });

  it('does not open retroactively once the collection window has passed', async () => {
    /*
     * The first of the two judgement calls. If the trigger was down all week
     * and the first tick arrives after Friday's close time, opening then serves
     * nobody: a health check exists to collect answers between open and close,
     * and that window is gone. Opening would produce a session that is
     * immediately overdue for closing, and a prompt after the fact.
     *
     * Saturday, after Friday 17:00.
     */
    await tickAt('2026-09-19T10:00:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).toBeNull();
  });

  it('closes a session whose close time has passed', async () => {
    await tickAt('2026-09-14T09:00:00Z');
    expect(await repos.session.findOpenByTeamId(teamId)).not.toBeNull();

    // Friday 17:04 — four minutes late, which the old equality check ignored
    await tickAt('2026-09-18T17:04:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).toBeNull();
  });

  it('closes a session that missed its close by days, and starts the new cycle', async () => {
    /*
     * The second judgement call, and it differs from a missed open. A session
     * past its close is still collecting, so leaving it open means a check that
     * never ends and results that never appear. However late, closing is right.
     *
     * The same tick then opens the current cycle, which is also right: a week
     * later there is a new check due, and the reader should not have to run the
     * scheduler twice to get it.
     */
    await tickAt('2026-09-14T09:00:00Z');
    const stale = (await repos.session.findOpenByTeamId(teamId))!;

    await tickAt('2026-09-21T11:00:00Z');

    expect((await repos.session.findById(stale.id))!.status).toBe('closed');

    const current = await repos.session.findOpenByTeamId(teamId);
    expect(current).not.toBeNull();
    expect(current!.id).not.toBe(stale.id);
  });

  it('does not reopen a check that was closed early in the same cycle', async () => {
    /*
     * Without this, closing a health check early springs it back open on the
     * next tick — the manager ends it Wednesday, the team is prompted again
     * Thursday, and the results they were about to read disappear.
     *
     * Worth writing deliberately: mutation-checking showed the guard against it
     * was passing every test with the guard removed. "No session is currently
     * open" covers the ordinary case, so the only way to exercise this one is a
     * cycle whose session has already been closed while the window is still
     * open.
     */
    await tickAt('2026-09-14T09:00:00Z');
    const session = (await repos.session.findOpenByTeamId(teamId))!;

    // A manager ends it early, on Wednesday
    await sessionService.close(teamId, session.id);

    // Thursday, still inside the collection window
    await tickAt('2026-09-17T10:00:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).toBeNull();
    expect(await repos.session.findByTeamId(teamId)).toHaveLength(1);
  });

  it('does not close before the close time', async () => {
    await tickAt('2026-09-14T09:00:00Z');

    await tickAt('2026-09-16T12:00:00Z');

    expect(await repos.session.findOpenByTeamId(teamId)).not.toBeNull();
  });

  it('leaves a team with no schedule alone', async () => {
    const other = await repos.team.create({ name: 'Unscheduled', timezone: 'UTC' });

    await tickAt('2026-09-14T09:01:00Z');

    expect(await repos.session.findOpenByTeamId(other.id)).toBeNull();
  });
});

/**
 * A check nobody answered must not be re-materialised forever.
 *
 * Requirements: Explaining Itself 1.4
 *
 * The scheduler skipped sessions that already had aggregates. A check nobody
 * answered produces **zero** aggregates, so that test was never true for it and
 * every tick re-ran materialisation on it — for as long as the session existed.
 * Two empty checks on production had been re-processed every five minutes since
 * they closed.
 *
 * `materialisedAt` says whether the work was done, rather than inferring it from
 * whether the work produced anything.
 */
describe('SchedulerService.tick and materialisation', () => {
  let repos: Repositories;
  let sessionService: SessionService;
  let scheduler: ReturnType<typeof createSchedulerService>;
  let teamId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    sessionService = createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
      teamScheduleRepo: repos.teamSchedule,
    });
    scheduler = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService,
    });
    const team = await repos.team.create({ name: 'Materialise', timezone: 'UTC' });
    teamId = team.id;
    await repos.teamMember.create({ teamId, name: 'Alice', email: 'a@e.test' });
  });

  /** A closed session, old enough that the quiet period has elapsed. */
  async function closedSession() {
    const session = await repos.session.create({ teamId, status: 'open' });
    await repos.session.update(session.id, {
      status: 'closed',
      actualCloseAt: new Date('2026-09-14T10:00:00Z'),
    });
    return session;
  }

  it('records when it materialised a session', async () => {
    const session = await closedSession();

    await scheduler.tick(new Date('2026-09-14T10:05:00Z'));

    const after = await repos.session.findById(session.id);
    expect(after?.materialisedAt).toBeInstanceOf(Date);
  });

  it('does not materialise the same empty session twice', async () => {
    /*
     * The defect. Zero aggregates is not evidence that nothing was done — it is
     * exactly what a check nobody answered produces, so the old test
     * (aggregates.length > 0) was never true for one and every tick re-ran it.
     *
     * Counts calls rather than comparing timestamps. The first version of this
     * test asserted materialisedAt was unchanged, and passed under a mutation
     * that re-materialised on every tick — because two wall-clock reads a
     * millisecond apart can be equal.
     */
    const session = await closedSession();

    let materialisations = 0;
    const counting = createSchedulerService({
      teamRepo: repos.team,
      teamScheduleRepo: repos.teamSchedule,
      sessionRepo: repos.session,
      sessionService: {
        ...sessionService,
        materializeAggregates: async (id: string) => {
          materialisations += 1;
          return sessionService.materializeAggregates(id);
        },
      },
    });

    await counting.tick(new Date('2026-09-14T10:05:00Z'));
    await counting.tick(new Date('2026-09-14T10:30:00Z'));
    await counting.tick(new Date('2026-09-14T11:00:00Z'));

    expect(materialisations, 'three ticks, one materialisation').toBe(1);
    expect((await repos.session.findById(session.id))?.materialisedAt).toBeInstanceOf(Date);
  });

  it('still waits out the quiet period before materialising', async () => {
    // The 30 seconds exist so responses in flight at close time land first
    const session = await repos.session.create({ teamId, status: 'open' });
    const closedAt = new Date('2026-09-14T10:00:00Z');
    await repos.session.update(session.id, { status: 'closed', actualCloseAt: closedAt });

    await scheduler.tick(new Date(closedAt.getTime() + 5_000));

    expect((await repos.session.findById(session.id))?.materialisedAt).toBeFalsy();
  });

  it('leaves an open session alone', async () => {
    const session = await repos.session.create({ teamId, status: 'open' });

    await scheduler.tick(new Date('2026-09-14T10:05:00Z'));

    expect((await repos.session.findById(session.id))?.materialisedAt).toBeFalsy();
  });
});
