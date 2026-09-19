/**
 * The session service writes times from its own clock, not the wall clock.
 *
 * Requirements: Original 3.2, 10.4; Knowing What Happened 1.2
 *
 * `createSessionService` takes an injectable `now`, and two writes ignored it
 * and called `new Date()` directly — the two that stamp `actualCloseAt`. A
 * service with an injected clock that reads the wall clock anyway is a service
 * whose clock injection is a lie, and every caller that sets one is being
 * quietly overruled.
 *
 * Found through a test that was not about this at all. Four scheduler-record
 * tests started failing at 17:00 UTC on 2026-09-18 and three of them again on
 * the 19th, because the tick compares its own date against `actualCloseAt` and
 * the two were being taken from different clocks. A fix on the 18th injected a
 * clock into the service and stopped there, which was treating the symptom:
 * the writes still ignored it, and the tests failed again the next morning for
 * the same underlying reason wearing a different date.
 *
 * So this asserts the cause rather than the symptom. It is about ordinary
 * correctness as much as about tests: a deployment whose database clock differs
 * from its process clock stores close times nothing else agrees with, and the
 * 30-second quiet period before aggregates are computed is a comparison
 * between exactly those two numbers.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createSessionService, type SessionService } from '@/lib/services/session.service';

/** Far enough from any real clock that a stray `new Date()` cannot pass. */
const FIXED = new Date('2001-02-03T04:05:06.000Z');

let repos: Repositories;
let sessions: SessionService;
let teamId = '';

beforeEach(async () => {
  repos = createInMemoryRepositories();
  sessions = createSessionService({
    sessionRepo: repos.session,
    sessionLinkRepo: repos.sessionLink,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    sessionAggregateRepo: repos.sessionAggregate,
    teamScheduleRepo: repos.teamSchedule,
    now: () => FIXED,
  });

  const team = await repos.team.create({ name: 'Clock Team' });
  teamId = team.id;
  await repos.teamMember.create({ teamId, name: 'M', email: 'm@clock.test' });
});

describe('closing a check', () => {
  it('stamps the close from the injected clock', async () => {
    const opened = await sessions.open(teamId, 'system');

    await sessions.close(teamId, opened.id);

    const closed = await repos.session.findById(opened.id);
    expect(closed?.actualCloseAt).toEqual(FIXED);
  });
});

describe('opening a check while one is already open', () => {
  it('stamps the close of the one it supersedes from the injected clock', async () => {
    /*
     * At most one session is open per team, so opening closes whatever was
     * running. That close is a real close — the dashboard reads its time, and
     * the scheduler measures the quiet period from it — and it used the wall
     * clock while the session it replaced used the injected one.
     */
    const first = await sessions.open(teamId, 'system');

    await sessions.open(teamId, 'system');

    const superseded = await repos.session.findById(first.id);
    expect(superseded?.status).toBe('closed');
    expect(superseded?.actualCloseAt).toEqual(FIXED);
  });
});

describe('materialising', () => {
  it('stamps it from the injected clock too', async () => {
    // Already correct, and asserted so that the three stay consistent — they
    // are compared against each other, not read in isolation
    const opened = await sessions.open(teamId, 'system');
    await sessions.close(teamId, opened.id);

    await sessions.materializeAggregates(opened.id);

    const done = await repos.session.findById(opened.id);
    expect(done?.materialisedAt).toEqual(FIXED);
  });
});

describe('every time the service writes', () => {
  it('agrees with every other time it writes', async () => {
    /*
     * The property behind all three. The quiet period is
     * `tick now − actualCloseAt`, so a close taken from a different clock than
     * the one the caller set makes that subtraction meaningless — negative on a
     * machine an hour behind, and hours too large on one ahead.
     */
    const opened = await sessions.open(teamId, 'system');
    await sessions.close(teamId, opened.id);
    await sessions.materializeAggregates(opened.id);

    const session = await repos.session.findById(opened.id);
    const written = [session?.scheduledOpenAt, session?.actualCloseAt, session?.materialisedAt];

    for (const stamp of written.filter(Boolean)) {
      expect(stamp, 'a timestamp the service wrote from some other clock').toEqual(FIXED);
    }
  });
});
