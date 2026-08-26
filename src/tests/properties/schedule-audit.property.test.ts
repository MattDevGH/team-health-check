import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createInMemoryRepositories } from '@/lib/repositories';
import { createScheduleService } from '@/lib/services/schedule.service';

const timeArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hours, minutes]) => (
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  ));

const scheduleArb = fc.record({
  cadence: fc.constant('weekly'),
  openDay: fc.integer({ min: 0, max: 6 }),
  openTime: timeArb,
  closeDay: fc.integer({ min: 0, max: 6 }),
  closeTime: timeArb,
  timezone: fc.constantFrom('Europe/London', 'America/New_York', 'UTC'),
});

describe('Property 24: schedule changes produce immutable audit entries', () => {
  it('emits one complete actor-bound entry and none for a normalized repeat', async () => {
    await fc.assert(
      fc.asyncProperty(scheduleArb, fc.uuid(), async (schedule, actorId) => {
        const repos = createInMemoryRepositories();
        const service = createScheduleService({
          teamScheduleRepo: repos.teamSchedule,
        });
        const teamId = `team-${crypto.randomUUID()}`;

        await service.configure(teamId, schedule, actorId);
        await service.configure(
          teamId,
          schedule.timezone === 'Europe/London'
            ? { ...schedule, timezone: undefined }
            : schedule,
          actorId,
        );

        const entries = await repos.auditLog.findByTeamId(teamId);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          teamId,
          changeType: 'schedule_change',
          previousValue: 'null',
          newValue: JSON.stringify(schedule),
          userId: actorId,
        });
        expect(entries[0].timestamp).toBeInstanceOf(Date);
      }),
      { numRuns: 100 },
    );
  });
});
