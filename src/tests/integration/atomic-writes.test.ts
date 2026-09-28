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
import { PrismaTeamMemberRoleRepository } from '@/lib/repositories/prisma/team-member-role.repository';
import { PrismaTeamRepository } from '@/lib/repositories/prisma/team.repository';

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

/**
 * Requirements: NFR 3.5; 1.6, 19.7
 *
 * `removeMember` has been documented as atomic since it was written — "protect
 * the final manager, remove, and audit" — while the removal and the entry were
 * two separate awaits. A failure between them removed somebody from a team
 * with nothing recording who did it, in a log whose whole purpose is to answer
 * that.
 */
describe('removing a member from a team', () => {
  let db: CountedDatabase;
  let roleRepo: PrismaTeamMemberRoleRepository;
  let teamId = '';
  let leaverId = '';

  beforeEach(async () => {
    db = await createCountedDatabase();
    roleRepo = new PrismaTeamMemberRoleRepository(db.prisma);

    const team = await db.prisma.team.create({ data: { name: 'Audited Team' } });
    teamId = team.id;

    // Two managers, so removing one is permitted
    for (const name of ['Keeper', 'Leaver']) {
      const member = await db.prisma.teamMember.create({
        data: { teamId, name, email: `${name.toLowerCase()}@atomic.invalid` },
      });
      await db.prisma.teamMemberRole.create({
        data: { memberId: member.id, teamId, role: 'delivery_manager' },
      });
      if (name === 'Leaver') leaverId = member.id;
    }
  });

  afterEach(async () => {
    await db.close();
  });

  function entry(overrides: Record<string, string> = {}) {
    return {
      teamId,
      changeType: 'member_removed',
      previousValue: '{}',
      newValue: '{}',
      userId: 'actor-1',
      ...overrides,
    };
  }

  it('removes the member and records who did it', async () => {
    await roleRepo.removeMemberWithRoleProtection(leaverId, teamId, entry());

    expect(await db.prisma.teamMember.count({ where: { id: leaverId } })).toBe(0);
    expect(await db.prisma.auditLogEntry.count({ where: { teamId } })).toBe(1);
  });

  /** Requirement NFR 3.5 — the half that was only ever claimed. */
  it('keeps the member when the entry cannot be written', async () => {
    // A team that does not exist: a foreign key the database itself refuses
    await expect(
      roleRepo.removeMemberWithRoleProtection(leaverId, teamId, entry({ teamId: 'no-such-team' })),
    ).rejects.toThrow();

    expect(await db.prisma.teamMember.count({ where: { id: leaverId } })).toBe(1);
    expect(await db.prisma.auditLogEntry.count()).toBe(0);
  });

  it('writes no entry when the removal itself is refused', async () => {
    // The final manager cannot be removed, and a log saying otherwise would be
    // worse than no log
    const keeper = await db.prisma.teamMember.findFirst({ where: { teamId, name: 'Keeper' } });
    await roleRepo.removeMemberWithRoleProtection(leaverId, teamId, entry());

    await expect(
      roleRepo.removeMemberWithRoleProtection(keeper!.id, teamId, entry()),
    ).rejects.toThrow(/final delivery manager/i);

    expect(await db.prisma.auditLogEntry.count({ where: { teamId } })).toBe(1);
  });
});

/**
 * Requirements: NFR 3.5, NFR 3.6, NFR 3.7; 7.9, 19.4
 *
 * Genesis is the door every first user arrives through. It claimed the token,
 * then created a team, a member, a role, an audit entry and a session — five
 * writes after an irreversible one.
 *
 * The worst ordering was the original: the token is spent first, so a failure
 * anywhere after it left somebody holding a used link and no team, with no way
 * to try again. Claiming inside the transaction is the point of this change,
 * not just the writes that follow it.
 */
describe('creating a team from a genesis token', () => {
  let db: CountedDatabase;
  let teamRepo: PrismaTeamRepository;

  beforeEach(async () => {
    db = await createCountedDatabase();
    teamRepo = new PrismaTeamRepository(db.prisma);

    await db.prisma.pendingGenesis.create({
      data: {
        token: 'genesis-token',
        email: 'first@genesis.invalid',
        used: false,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  });

  afterEach(async () => {
    await db.close();
  });

  function params(overrides: Record<string, unknown> = {}) {
    return {
      token: 'genesis-token',
      memberId: 'member-genesis',
      memberName: 'first',
      email: 'first@genesis.invalid',
      team: { name: 'First Team', description: 'made at genesis' },
      audit: {
        changeType: 'team_created',
        previousValue: '',
        newValue: '{}',
        userId: 'member-genesis',
      },
      session: { token: 'session-token', expiresAt: new Date(Date.now() + 3_600_000) },
      ...overrides,
    };
  }

  it('creates everything a first user needs, in one go', async () => {
    const result = await teamRepo.createFromGenesis(params());

    expect(result).not.toBeNull();
    expect(await db.prisma.team.count()).toBe(1);
    expect(await db.prisma.teamMember.count()).toBe(1);
    expect(await db.prisma.teamMemberRole.count({ where: { role: 'delivery_manager' } })).toBe(1);
    expect(await db.prisma.auditLogEntry.count()).toBe(1);
    expect(await db.prisma.userSession.count()).toBe(1);
    expect((await db.prisma.pendingGenesis.findFirst())?.used).toBe(true);
  });

  /**
   * Requirement NFR 3.6, and the reason this one matters most: a used token
   * cannot be un-used by the person holding it.
   */
  it('leaves the token unspent when the team cannot be created', async () => {
    // A session token that collides with one already stored, so the last
    // write in the transaction fails after everything else has succeeded
    await db.prisma.userSession.create({
      data: {
        memberId: 'someone-else',
        token: 'session-token',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await expect(teamRepo.createFromGenesis(params())).rejects.toThrow();

    expect(await db.prisma.team.count()).toBe(0);
    expect(await db.prisma.teamMember.count()).toBe(0);
    expect((await db.prisma.pendingGenesis.findFirst())?.used).toBe(false);
  });

  it('can be retried after a failure, because nothing was consumed', async () => {
    await db.prisma.userSession.create({
      data: {
        memberId: 'someone-else',
        token: 'session-token',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await expect(teamRepo.createFromGenesis(params())).rejects.toThrow();

    const result = await teamRepo.createFromGenesis(
      params({ session: { token: 'another-token', expiresAt: new Date(Date.now() + 3_600_000) } }),
    );

    expect(result).not.toBeNull();
    expect(await db.prisma.team.count()).toBe(1);
  });

  it('refuses a token that has already been spent', async () => {
    await teamRepo.createFromGenesis(params());

    const second = await teamRepo.createFromGenesis(
      params({
        memberId: 'member-two',
        session: { token: 'second-session', expiresAt: new Date(Date.now() + 3_600_000) },
      }),
    );

    // Null rather than a throw: the caller distinguishes "not found" from
    // "already used", and both are the same answer here
    expect(second).toBeNull();
    expect(await db.prisma.team.count()).toBe(1);
  });

  it('refuses an expired token', async () => {
    await db.prisma.pendingGenesis.update({
      where: { token: 'genesis-token' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await teamRepo.createFromGenesis(params())).toBeNull();
    expect(await db.prisma.team.count()).toBe(0);
  });
});
