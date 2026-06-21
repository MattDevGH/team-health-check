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

    // Simulate "now" being Friday 17:00 UTC
    // 2024-01-12 is a Friday
    const now = new Date('2024-01-12T17:00:00.000Z');
    await scheduler.tick(now);

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
});
