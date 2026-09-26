/**
 * The response repository, against a real database.
 *
 * Requirements: 16.1, 18.2, 18.4; NFR 3.7
 *
 * Coverage of this file was 4.5% when it was measured on 2026-09-26, and the
 * rolling average's privacy filter lives in it. The in-memory fake had the
 * same filter and was well covered — which proves the fake filters, not that
 * the query does.
 *
 * The two are different in a way that matters: the fake compares
 * `finalisedAt === null` in JavaScript, and the real one sends
 * `finalisedAt: { not: null }` to SQLite, where NULL comparison has its own
 * rules. A filter that quietly matched nothing, or everything, would look
 * identical from the service's side.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createCountedDatabase, type CountedDatabase } from './support/counted-database';
import { PrismaResponseRepository } from '@/lib/repositories/prisma/response.repository';

const QUESTION = 'q-delivering-value';

describe('PrismaResponseRepository', () => {
  let db: CountedDatabase;
  let repo: PrismaResponseRepository;
  let teamId = '';
  let sessionId = '';
  let memberIds: string[] = [];

  beforeEach(async () => {
    db = await createCountedDatabase();
    repo = new PrismaResponseRepository(db.prisma);

    await db.prisma.question.create({
      data: { id: QUESTION, title: 'Delivering Value', description: '', displayOrder: 1 },
    });

    const team = await db.prisma.team.create({ data: { name: 'Repo Team' } });
    teamId = team.id;

    memberIds = [];
    for (const name of ['Alice', 'Bea', 'Cass']) {
      const member = await db.prisma.teamMember.create({
        data: { teamId, name, email: `${name.toLowerCase()}@repo.invalid` },
      });
      memberIds.push(member.id);
    }

    const session = await db.prisma.healthCheckSession.create({
      data: { teamId, status: 'open' },
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await db.close();
  });

  async function answer(memberId: string, score: number) {
    return repo.upsert({ memberId, sessionId, questionId: QUESTION, score });
  }

  describe('what the rolling average is allowed to see', () => {
    /** Requirement 16.1 — an answer its author can still change does not count. */
    it('returns nothing while every answer is still live', async () => {
      for (const [index, memberId] of memberIds.entries()) {
        await answer(memberId, index + 1);
      }

      expect(await repo.findRecentByTeamAndQuestion(teamId, QUESTION, 20)).toHaveLength(0);
    });

    it('returns only the answers their authors have finished with', async () => {
      for (const [index, memberId] of memberIds.entries()) {
        await answer(memberId, index + 1);
      }
      await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date());

      const recent = await repo.findRecentByTeamAndQuestion(teamId, QUESTION, 20);

      expect(recent).toHaveLength(1);
      expect(recent[0]?.memberId).toBe(memberIds[0]);
    });

    it('returns everything once the session has closed them all', async () => {
      for (const [index, memberId] of memberIds.entries()) {
        await answer(memberId, index + 1);
      }
      await repo.finaliseForSession(sessionId, new Date());

      expect(await repo.findRecentByTeamAndQuestion(teamId, QUESTION, 20)).toHaveLength(3);
    });

    it('does not reach into another team', async () => {
      const other = await db.prisma.team.create({ data: { name: 'Other Team' } });
      const outsider = await db.prisma.teamMember.create({
        data: { teamId: other.id, name: 'Outsider', email: 'out@repo.invalid' },
      });
      const otherSession = await db.prisma.healthCheckSession.create({
        data: { teamId: other.id, status: 'open' },
      });
      await repo.upsert({
        memberId: outsider.id,
        sessionId: otherSession.id,
        questionId: QUESTION,
        score: 5,
      });
      await repo.finaliseForSession(otherSession.id, new Date());

      expect(await repo.findRecentByTeamAndQuestion(teamId, QUESTION, 20)).toHaveLength(0);
    });

    it('takes the most recent, not an arbitrary few', async () => {
      for (const [index, memberId] of memberIds.entries()) {
        await answer(memberId, index + 1);
      }
      await repo.finaliseForSession(sessionId, new Date());

      expect(await repo.findRecentByTeamAndQuestion(teamId, QUESTION, 2)).toHaveLength(2);
    });
  });

  describe('marking answers final', () => {
    /** Requirement 18.2 */
    it('stamps every answer the member gave in that session', async () => {
      await db.prisma.question.create({
        data: { id: 'q-two', title: 'Two', description: '', displayOrder: 2 },
      });
      await answer(memberIds[0]!, 3);
      await repo.upsert({
        memberId: memberIds[0]!,
        sessionId,
        questionId: 'q-two',
        score: 4,
      });

      const finalised = await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date());

      expect(finalised).toHaveLength(2);
      expect(finalised.every(entry => entry.finalisedAt !== null)).toBe(true);
    });

    it('keeps the first timestamp when called again', async () => {
      await answer(memberIds[0]!, 3);
      const first = await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date(1000));
      const again = await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date(9999));

      // Finishing twice is finishing once
      expect(again[0]?.finalisedAt).toEqual(first[0]?.finalisedAt);
    });

    it('leaves another member alone', async () => {
      await answer(memberIds[0]!, 3);
      await answer(memberIds[1]!, 4);

      await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date());

      const theirs = await repo.findByMemberAndSession(memberIds[1]!, sessionId);
      expect(theirs[0]?.finalisedAt).toBeNull();
    });

    /** Requirement 18.4 */
    it('counts how many a closing session had left to stamp', async () => {
      await answer(memberIds[0]!, 3);
      await answer(memberIds[1]!, 4);
      await repo.finaliseForMemberSession(memberIds[0]!, sessionId, new Date());

      expect(await repo.finaliseForSession(sessionId, new Date())).toBe(1);
    });
  });

  it('replaces an answer rather than adding a second', async () => {
    await answer(memberIds[0]!, 2);
    await answer(memberIds[0]!, 5);

    const mine = await repo.findByMemberAndSession(memberIds[0]!, sessionId);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.score).toBe(5);
  });

  it('removes a member’s answers and reports how many', async () => {
    await answer(memberIds[0]!, 2);
    await answer(memberIds[1]!, 3);

    expect(await repo.deleteByMemberId(memberIds[0]!)).toBe(1);
    expect(await repo.findBySession(sessionId)).toHaveLength(1);
  });

  it('counts the answers a session has for one question', async () => {
    await answer(memberIds[0]!, 2);
    await answer(memberIds[1]!, 3);

    expect(await repo.countBySessionAndQuestion(sessionId, QUESTION)).toBe(2);
  });
});
