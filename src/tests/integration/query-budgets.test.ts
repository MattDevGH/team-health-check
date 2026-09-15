// @vitest-environment node

/**
 * How many queries a request is allowed to make.
 *
 * Requirements: Feeling Responsive 4.2, 4.4, NFR 1.2
 *
 * Ratchets, not targets. Each number is what the route issues today, so the
 * test fails when the count grows — turning "we accidentally made every
 * dashboard load do twelve round trips" into a failing test with a name, and
 * leaving "we deliberately need one more" as a one-line change with a reviewer.
 *
 * The route handlers run for real here. The rest of the suite gives them
 * in-memory repositories, which is right for behaviour and useless for this: a
 * fake issues no queries, so a budget measured against one would always pass.
 * `@/lib/prisma` is pointed at the counted database instead, and the production
 * container is unmocked so the real wiring assembles on top of it.
 *
 * Counting the route rather than the repositories underneath it is deliberate.
 * The queries that hurt are the ones nobody remembers making — the auth lookup,
 * the membership check — and those live in the route.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createCountedDatabase, type CountedDatabase } from './support/counted-database';
import type { PrismaClient } from '@/generated/prisma';
import { seedQuestions } from '../../../prisma/seed';

/*
 * Hoisted so the module mock below can reach it. The mock's factory runs the
 * first time anything imports `@/lib/prisma`, which is why the routes are
 * imported dynamically in `beforeAll`, after the client exists.
 */
const shared = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient }));

vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return shared.prisma;
  },
  createPrismaClient: () => shared.prisma,
}));

// The global setup replaces this with in-memory repositories for every other
// test in the suite. Here the real one is the whole point.
vi.unmock('@/lib/container-production');

let db: CountedDatabase;
let getMe: (request: NextRequest) => Promise<Response>;
let getTrends: (
  request: NextRequest,
  context?: { params: Promise<{ teamId: string }> },
) => Promise<Response>;

const TOKEN = 'budget-session-token';
let teamId = '';

beforeAll(async () => {
  db = await createCountedDatabase();
  shared.prisma = db.prisma;

  // The fixed catalogue: aggregates carry a foreign key to it, and the trends
  // route reads it to name a theme nobody answered
  await seedQuestions(db.prisma);

  const team = await db.prisma.team.create({
    data: { name: 'Budget Team', timezone: 'Europe/London' },
  });
  teamId = team.id;

  const member = await db.prisma.teamMember.create({
    data: { teamId: team.id, name: 'Budget Member', email: 'budget@example.invalid' },
  });

  await db.prisma.teamMemberRole.create({
    data: { memberId: member.id, teamId: team.id, role: 'delivery_manager' },
  });

  await db.prisma.userSession.create({
    data: {
      memberId: member.id,
      token: TOKEN,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  // Two closed sessions, so the trends route takes its populated path rather
  // than the short one — a budget measured against an empty team would flatter
  // every route that returns early
  for (const closedAt of ['2026-08-01T17:00:00.000Z', '2026-08-08T17:00:00.000Z']) {
    const session = await db.prisma.healthCheckSession.create({
      data: {
        teamId: team.id,
        status: 'closed',
        actualOpenAt: new Date(closedAt),
        actualCloseAt: new Date(closedAt),
        materialisedAt: new Date(closedAt),
      },
    });

    await db.prisma.sessionAggregate.create({
      data: {
        sessionId: session.id,
        questionId: 'q-delivering-value',
        averageScore: 4,
        responseCount: 5,
        improvingCount: 2,
        stableCount: 2,
        decliningCount: 1,
        materialisedAt: new Date(closedAt),
      },
    });
  }

  const me = await import('@/app/api/me/route');
  const trends = await import('@/app/api/teams/[teamId]/trends/route');
  getMe = me.GET as typeof getMe;
  getTrends = trends.GET as typeof getTrends;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/**
 * A request the route can actually read.
 *
 * The handlers reach for `request.cookies`, which is a NextRequest addition;
 * a plain Request reaches the auth check and fails on undefined.
 */
function signedIn(url: string): NextRequest {
  const headers = new Headers();
  headers.set('cookie', `session=${TOKEN}`);
  return new NextRequest(url, { method: 'GET', headers });
}

describe('GET /api/me', () => {
  it('answers, so the count below is a count of work that succeeded', async () => {
    // A 401 would issue one query and pass every budget in this file
    const response = await getMe(signedIn('http://localhost/api/me'));

    expect(response.status).toBe(200);
  });

  it('issues at most 5 queries', async () => {
    const queries = await db.countQueries(async () => {
      await getMe(signedIn('http://localhost/api/me'));
    });

    expect(queries, 'GET /api/me query budget').toBeLessThanOrEqual(5);
  });
});

describe('GET /api/teams/[teamId]/trends', () => {
  const context = () => ({ params: Promise.resolve({ teamId }) });

  it('answers with the populated path, not an early return', async () => {
    const response = await getTrends(
      signedIn(`http://localhost/api/teams/${teamId}/trends`),
      context(),
    );
    const body = (await response.json()) as { sessions?: unknown[] };

    expect(response.status).toBe(200);
    expect(body.sessions, 'two closed sessions were seeded').toHaveLength(2);
  });

  it('issues at most 8 queries', async () => {
    /*
     * Nine when this budget was first measured, against an estimate of seven:
     * two of the queries live inside the services the route calls rather than
     * in the route, which is the argument for measuring rather than reading.
     *
     * Eight now, and the one that went is worth recording. The privacy mode
     * and the session averages each read the same team row. Awaited in turn
     * they were two round trips; started together they land in the same tick,
     * and Prisma coalesces identical findUnique calls into one
     * `WHERE id IN (?,?)`. Overlapping the waits also removed one of them.
     */
    const queries = await db.countQueries(async () => {
      await getTrends(signedIn(`http://localhost/api/teams/${teamId}/trends`), context());
    });

    expect(queries, 'GET /api/teams/[teamId]/trends query budget').toBeLessThanOrEqual(8);
  });
});

describe('the budgets themselves', () => {
  it('are measured against the real database, not a fake', async () => {
    /*
     * The failure that would make this whole file decorative. Every other test
     * in the suite gets in-memory repositories from the global setup; if that
     * mock were still in place here, every route would issue zero queries and
     * every budget would pass for ever.
     */
    const queries = await db.countQueries(async () => {
      await getMe(signedIn('http://localhost/api/me'));
    });

    expect(queries, 'a route that issues no queries is a route talking to a fake')
      .toBeGreaterThan(0);
  });
});
