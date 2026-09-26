/**
 * Multi-row writes either happen or do not.
 *
 * Requirements: NFR 3.5, NFR 3.6, NFR 3.7
 *
 * Against a real SQLite file through the libSQL adapter, because that is the
 * only place the property exists. An in-memory fake applies writes one at a
 * time and has nothing to roll back, so a test using one proves the service
 * called the repositories and says nothing about what survives a failure.
 *
 * The failure is injected with the database's own constraints rather than a
 * stub: an aggregate naming a question that does not exist violates a foreign
 * key, and the driver rejects it exactly as it would reject a real problem.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createCountedDatabase, type CountedDatabase } from './support/counted-database';
import { PrismaSessionRepository } from '@/lib/repositories/prisma/session.repository';
import { PrismaSessionAggregateRepository } from '@/lib/repositories/prisma/session-aggregate.repository';

const QUESTIONS = ['q-delivering-value', 'q-team-collaboration', 'q-ease-of-delivery'];

describe('materialising a session', () => {
  let db: CountedDatabase;
  let sessionRepo: PrismaSessionRepository;
  let aggregateRepo: PrismaSessionAggregateRepository;
  let sessionId = '';

  beforeEach(async () => {
    db = await createCountedDatabase();
    sessionRepo = new PrismaSessionRepository(db.prisma);
    aggregateRepo = new PrismaSessionAggregateRepository(db.prisma);

    for (const [index, id] of QUESTIONS.entries()) {
      await db.prisma.question.create({
        data: { id, title: id, description: id, displayOrder: index + 1 },
      });
    }

    const team = await db.prisma.team.create({ data: { name: 'Atomic Team' } });
    const session = await db.prisma.healthCheckSession.create({
      data: { teamId: team.id, status: 'closed' },
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await db.close();
  });

  function aggregate(questionId: string) {
    return {
      questionId,
      averageScore: 4,
      responseCount: 2,
      improvingCount: 1,
      stableCount: 1,
      decliningCount: 0,
    };
  }

  it('writes every aggregate and records that it was done', async () => {
    await sessionRepo.materialise(sessionId, QUESTIONS.map(aggregate), new Date());

    expect(await aggregateRepo.findBySessionId(sessionId)).toHaveLength(3);
    expect((await sessionRepo.findById(sessionId))?.materialisedAt).not.toBeNull();
  });

  /**
   * Requirement NFR 3.5
   *
   * The loop that this replaced wrote one row per question and then set the
   * flag. A failure on the second question left the first written.
   */
  it('leaves nothing behind when one aggregate cannot be written', async () => {
    const doomed = [
      aggregate(QUESTIONS[0]!),
      // No such question: a foreign key the database itself refuses
      aggregate('q-does-not-exist'),
      aggregate(QUESTIONS[2]!),
    ];

    await expect(sessionRepo.materialise(sessionId, doomed, new Date())).rejects.toThrow();

    expect(await aggregateRepo.findBySessionId(sessionId)).toHaveLength(0);
    expect((await sessionRepo.findById(sessionId))?.materialisedAt).toBeNull();
  });

  /**
   * Requirement NFR 3.6
   *
   * `(sessionId, questionId)` is unique. Under the old loop a retry after a
   * partial write hit the rows the first attempt had made and threw, so the
   * session could never be materialised and nothing could repair it.
   */
  it('can be retried after a failure', async () => {
    await expect(
      sessionRepo.materialise(
        sessionId,
        [aggregate(QUESTIONS[0]!), aggregate('q-does-not-exist')],
        new Date(),
      ),
    ).rejects.toThrow();

    await sessionRepo.materialise(sessionId, QUESTIONS.map(aggregate), new Date());

    expect(await aggregateRepo.findBySessionId(sessionId)).toHaveLength(3);
  });

  it('can be run twice without conflicting with itself', async () => {
    // The scheduler is at-least-once: a tick that times out after committing
    // is indistinguishable from one that never ran
    await sessionRepo.materialise(sessionId, QUESTIONS.map(aggregate), new Date());
    await sessionRepo.materialise(sessionId, QUESTIONS.map(aggregate), new Date());

    expect(await aggregateRepo.findBySessionId(sessionId)).toHaveLength(3);
  });

  it('records nothing for a session with no answers, but still marks it done', async () => {
    // A check nobody answered produces zero aggregates, which must not be
    // mistaken for never having been computed
    await sessionRepo.materialise(sessionId, [], new Date());

    expect(await aggregateRepo.findBySessionId(sessionId)).toHaveLength(0);
    expect((await sessionRepo.findById(sessionId))?.materialisedAt).not.toBeNull();
  });
});

/**
 * Requirements: NFR 3.5, NFR 3.6; 6.1
 *
 * Opening a cycle closes the previous session, creates the new one and issues
 * a Session_Link for every member. A session that exists with no links is a
 * check nobody can answer — which happened in production on 2026-09-14 and is
 * why `reaching-your-health-check` exists.
 */
describe('opening a health check', () => {
  let db: CountedDatabase;
  let sessionRepo: PrismaSessionRepository;
  let teamId = '';
  let memberIds: string[] = [];

  beforeEach(async () => {
    db = await createCountedDatabase();
    sessionRepo = new PrismaSessionRepository(db.prisma);

    const team = await db.prisma.team.create({ data: { name: 'Opening Team' } });
    teamId = team.id;

    memberIds = [];
    for (const name of ['Alice', 'Bea', 'Cass']) {
      const member = await db.prisma.teamMember.create({
        data: { teamId, name, email: `${name.toLowerCase()}@atomic.invalid` },
      });
      memberIds.push(member.id);
    }
  });

  afterEach(async () => {
    await db.close();
  });

  function links(ids: string[], expiresAt = new Date(Date.now() + 86_400_000)) {
    return ids.map((memberId, index) => ({
      token: `token-${memberId}-${index}`,
      memberId,
      expiresAt,
    }));
  }

  async function linkCount(): Promise<number> {
    return db.prisma.sessionLink.count();
  }

  it('creates the session and a link for every member', async () => {
    const session = await sessionRepo.openCycle({
      session: { teamId, status: 'open', actualOpenAt: new Date() },
      links: links(memberIds),
    });

    expect(session.status).toBe('open');
    expect(await linkCount()).toBe(3);
  });

  /**
   * Requirement NFR 3.5. The loop this replaced created the session first and
   * then a link per member, so a failure part-way left a check some of the
   * team could reach and the rest could not.
   */
  it('creates no session at all when a link cannot be issued', async () => {
    const doomed = [
      ...links(memberIds.slice(0, 2)),
      // No such member: a foreign key the database itself refuses
      { token: 'token-ghost', memberId: 'member-does-not-exist', expiresAt: new Date() },
    ];

    await expect(
      sessionRepo.openCycle({
        session: { teamId, status: 'open', actualOpenAt: new Date() },
        links: doomed,
      }),
    ).rejects.toThrow();

    expect(await db.prisma.healthCheckSession.count()).toBe(0);
    expect(await linkCount()).toBe(0);
  });

  it('leaves the previous session open when the new cycle fails', async () => {
    const previous = await sessionRepo.openCycle({
      session: { teamId, status: 'open', actualOpenAt: new Date() },
      links: links(memberIds),
    });

    await expect(
      sessionRepo.openCycle({
        closeExisting: { id: previous.id, closedAt: new Date() },
        session: { teamId, status: 'open', actualOpenAt: new Date() },
        links: [{ token: 'token-ghost', memberId: 'nobody', expiresAt: new Date() }],
      }),
    ).rejects.toThrow();

    // Closing the old one and opening the new one is a single outcome: a team
    // left with no open check at all would be worse than the failure
    const stored = await sessionRepo.findById(previous.id);
    expect(stored?.status).toBe('open');
  });

  it('closes the previous session as part of opening the next', async () => {
    const previous = await sessionRepo.openCycle({
      session: { teamId, status: 'open', actualOpenAt: new Date() },
      links: links(memberIds),
    });

    await sessionRepo.openCycle({
      closeExisting: { id: previous.id, closedAt: new Date() },
      session: { teamId, status: 'open', actualOpenAt: new Date() },
      links: links(memberIds).map(link => ({ ...link, token: `${link.token}-2` })),
    });

    expect((await sessionRepo.findById(previous.id))?.status).toBe('closed');
    expect(await linkCount()).toBe(6);
  });

  it('opens a check for a team with no members yet', async () => {
    // Nothing to issue, but the check still exists to be answered later
    const session = await sessionRepo.openCycle({
      session: { teamId, status: 'open', actualOpenAt: new Date() },
      links: [],
    });

    expect(session.id).toBeTruthy();
    expect(await linkCount()).toBe(0);
  });
});
