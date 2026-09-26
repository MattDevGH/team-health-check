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
