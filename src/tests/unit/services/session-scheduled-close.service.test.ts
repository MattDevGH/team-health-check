/**
 * Unit tests for the scheduled open/close window stored when a session opens.
 *
 * Design (design.md): when a session cycle starts, `scheduledOpenAt` and
 * `scheduledCloseAt` are computed from the team schedule and stored as UTC.
 * Closing reminders and micro-pulse bundling both depend on a real close time.
 *
 * Requirements: 3.1, 3.2; Integration 8.2
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createSessionService } from '@/lib/services/session.service';
import type { SessionService } from '@/lib/services/session.service';

/** Monday 2026-08-24 09:00 UTC */
const OPEN_AT = new Date('2026-08-24T09:00:00.000Z');

describe('SessionService.open scheduled window', () => {
  let repos: Repositories;

  function build(now: Date = OPEN_AT): SessionService {
    return createSessionService({
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      sessionAggregateRepo: repos.sessionAggregate,
      teamScheduleRepo: repos.teamSchedule,
      now: () => now,
    });
  }

  async function seedSchedule(teamId: string, timezone: string): Promise<void> {
    await repos.teamSchedule.create({
      teamId,
      cadence: 'weekly',
      openDay: 1,
      openTime: '09:00',
      closeDay: 5,
      closeTime: '17:00',
      timezone,
    });
  }

  beforeEach(() => {
    repos = createInMemoryRepositories();
  });

  it('stores the open instant and the next scheduled close', async () => {
    const team = await repos.team.create({ name: 'Scheduled Team' });
    await seedSchedule(team.id, 'UTC');

    const session = await build().open(team.id, 'system');

    expect(session.scheduledOpenAt).toEqual(OPEN_AT);
    expect(session.scheduledCloseAt?.toISOString()).toBe('2026-08-28T17:00:00.000Z');
  });

  it('resolves the close time in the schedule timezone', async () => {
    const team = await repos.team.create({ name: 'London Team' });
    await seedSchedule(team.id, 'Europe/London');

    const session = await build().open(team.id, 'system');

    // Friday 17:00 BST is 16:00 UTC
    expect(session.scheduledCloseAt?.toISOString()).toBe('2026-08-28T16:00:00.000Z');
  });

  it('leaves the window unset when the team has no schedule', async () => {
    const team = await repos.team.create({ name: 'Unscheduled Team' });

    const session = await build().open(team.id, 'system');

    expect(session.scheduledOpenAt).toBeNull();
    expect(session.scheduledCloseAt).toBeNull();
  });

  it('recomputes the close for a session opened after that week has closed', async () => {
    const team = await repos.team.create({ name: 'Next Week Team' });
    await seedSchedule(team.id, 'UTC');

    // Opened on Saturday, after Friday's close has already passed
    const session = await build(new Date('2026-08-29T09:00:00.000Z')).open(team.id, 'system');

    expect(session.scheduledCloseAt?.toISOString()).toBe('2026-09-04T17:00:00.000Z');
  });
});
