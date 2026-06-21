import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMagicLinkRepository } from './magic-link.repository';
import { InMemoryPendingGenesisRepository } from './pending-genesis.repository';
import { InMemoryAuditLogRepository } from './audit-log.repository';
import { InMemoryQuestionRepository } from './question.repository';
import { InMemorySessionLinkRepository } from './session-link.repository';
import { InMemoryAvailabilityRepository } from './availability.repository';
import { InMemorySessionAggregateRepository } from './session-aggregate.repository';
import { InMemoryTeamMemberRoleRepository } from './team-member-role.repository';
import { InMemoryPairingCodeRepository } from './pairing-code.repository';
import { InMemoryUserSessionRepository } from './user-session.repository';
import { NotFoundError } from '../../errors';

describe('InMemoryMagicLinkRepository', () => {
  let repo: InMemoryMagicLinkRepository;

  beforeEach(() => {
    repo = new InMemoryMagicLinkRepository();
  });

  it('creates a magic link', async () => {
    const link = await repo.create({
      token: 'tok-1',
      memberId: 'm1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(link.id).toBeDefined();
    expect(link.token).toBe('tok-1');
    expect(link.used).toBe(false);
  });

  it('finds a link by token', async () => {
    await repo.create({ token: 'tok-2', memberId: 'm1', expiresAt: new Date(Date.now() + 60_000) });
    const found = await repo.findByToken('tok-2');
    expect(found).not.toBeNull();
    expect(found!.token).toBe('tok-2');
  });

  it('returns null for non-existent token', async () => {
    expect(await repo.findByToken('missing')).toBeNull();
  });

  describe('claimToken atomicity', () => {
    it('first claim succeeds', async () => {
      await repo.create({ token: 'claim-1', memberId: 'm1', expiresAt: new Date(Date.now() + 60_000) });
      const claimed = await repo.claimToken('claim-1');
      expect(claimed).not.toBeNull();
      expect(claimed!.used).toBe(true);
    });

    it('second claim fails (already used)', async () => {
      await repo.create({ token: 'claim-2', memberId: 'm1', expiresAt: new Date(Date.now() + 60_000) });
      await repo.claimToken('claim-2');
      const second = await repo.claimToken('claim-2');
      expect(second).toBeNull();
    });

    it('claim fails for expired token', async () => {
      await repo.create({ token: 'expired', memberId: 'm1', expiresAt: new Date(Date.now() - 1000) });
      const claimed = await repo.claimToken('expired');
      expect(claimed).toBeNull();
    });

    it('claim fails for non-existent token', async () => {
      const claimed = await repo.claimToken('nope');
      expect(claimed).toBeNull();
    });
  });
});

describe('InMemoryPendingGenesisRepository', () => {
  let repo: InMemoryPendingGenesisRepository;

  beforeEach(() => {
    repo = new InMemoryPendingGenesisRepository();
  });

  it('creates a pending genesis', async () => {
    const genesis = await repo.create({
      token: 'gen-1',
      email: 'a@b.com',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(genesis.id).toBeDefined();
    expect(genesis.used).toBe(false);
  });

  describe('claimToken atomicity', () => {
    it('first claim succeeds', async () => {
      await repo.create({ token: 'gen-claim', email: 'a@b.com', expiresAt: new Date(Date.now() + 60_000) });
      const claimed = await repo.claimToken('gen-claim');
      expect(claimed).not.toBeNull();
      expect(claimed!.used).toBe(true);
    });

    it('second claim fails (already used)', async () => {
      await repo.create({ token: 'gen-dup', email: 'a@b.com', expiresAt: new Date(Date.now() + 60_000) });
      await repo.claimToken('gen-dup');
      const second = await repo.claimToken('gen-dup');
      expect(second).toBeNull();
    });

    it('claim fails for expired token', async () => {
      await repo.create({ token: 'gen-exp', email: 'a@b.com', expiresAt: new Date(Date.now() - 1000) });
      const claimed = await repo.claimToken('gen-exp');
      expect(claimed).toBeNull();
    });

    it('claim fails for non-existent token', async () => {
      expect(await repo.claimToken('nope')).toBeNull();
    });
  });
});

describe('InMemoryAuditLogRepository', () => {
  let repo: InMemoryAuditLogRepository;

  beforeEach(() => {
    repo = new InMemoryAuditLogRepository();
  });

  it('creates an audit log entry', async () => {
    const entry = await repo.create({
      teamId: 't1',
      changeType: 'name_change',
      previousValue: 'Old',
      newValue: 'New',
      userId: 'u1',
    });
    expect(entry.id).toBeDefined();
    expect(entry.teamId).toBe('t1');
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('returns entries sorted most recent first', async () => {
    await repo.create({ teamId: 't1', changeType: 'a', previousValue: '', newValue: '', userId: 'u1' });
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 5));
    await repo.create({ teamId: 't1', changeType: 'b', previousValue: '', newValue: '', userId: 'u1' });

    const entries = await repo.findByTeamId('t1');
    expect(entries).toHaveLength(2);
    expect(entries[0].changeType).toBe('b'); // most recent
    expect(entries[1].changeType).toBe('a');
  });

  it('filters by teamId', async () => {
    await repo.create({ teamId: 't1', changeType: 'x', previousValue: '', newValue: '', userId: 'u1' });
    await repo.create({ teamId: 't2', changeType: 'y', previousValue: '', newValue: '', userId: 'u1' });

    const entries = await repo.findByTeamId('t1');
    expect(entries).toHaveLength(1);
    expect(entries[0].changeType).toBe('x');
  });

  it('respects pagination limit', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({ teamId: 't1', changeType: `c${i}`, previousValue: '', newValue: '', userId: 'u1' });
    }
    const entries = await repo.findByTeamId('t1', { limit: 3 });
    expect(entries).toHaveLength(3);
  });

  it('paginates with cursor', async () => {
    const created = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 2));
      created.push(await repo.create({ teamId: 't1', changeType: `c${i}`, previousValue: '', newValue: '', userId: 'u1' }));
    }
    const firstPage = await repo.findByTeamId('t1', { limit: 2 });
    expect(firstPage).toHaveLength(2);

    const secondPage = await repo.findByTeamId('t1', { cursor: firstPage[1].id, limit: 2 });
    expect(secondPage).toHaveLength(2);
    // Second page should not overlap with first page
    expect(secondPage[0].id).not.toBe(firstPage[0].id);
    expect(secondPage[0].id).not.toBe(firstPage[1].id);
  });
});

describe('InMemoryQuestionRepository', () => {
  let repo: InMemoryQuestionRepository;

  beforeEach(() => {
    repo = new InMemoryQuestionRepository();
  });

  it('returns 5 fixed questions in display order', async () => {
    const questions = await repo.findAll();
    expect(questions).toHaveLength(5);
    expect(questions[0].id).toBe('q-delivering-value');
    expect(questions[4].id).toBe('q-psychological-safety');
    for (let i = 0; i < questions.length - 1; i++) {
      expect(questions[i].displayOrder).toBeLessThan(questions[i + 1].displayOrder);
    }
  });

  it('finds a question by id', async () => {
    const q = await repo.findById('q-team-collaboration');
    expect(q).not.toBeNull();
    expect(q!.title).toBe('Team Collaboration');
  });

  it('returns null for non-existent id', async () => {
    expect(await repo.findById('no-such-question')).toBeNull();
  });
});

describe('InMemorySessionLinkRepository', () => {
  let repo: InMemorySessionLinkRepository;

  beforeEach(() => {
    repo = new InMemorySessionLinkRepository();
  });

  it('creates and finds by token', async () => {
    await repo.create({ token: 'sl-1', memberId: 'm1', sessionId: 's1', expiresAt: new Date() });
    const found = await repo.findByToken('sl-1');
    expect(found).not.toBeNull();
    expect(found!.memberId).toBe('m1');
  });

  it('finds by member and session', async () => {
    await repo.create({ token: 'sl-2', memberId: 'm1', sessionId: 's1', expiresAt: new Date() });
    const found = await repo.findByMemberAndSession('m1', 's1');
    expect(found).not.toBeNull();
  });

  it('returns null for non-matching member/session', async () => {
    expect(await repo.findByMemberAndSession('m1', 's1')).toBeNull();
  });
});

describe('InMemoryAvailabilityRepository', () => {
  let repo: InMemoryAvailabilityRepository;

  beforeEach(() => {
    repo = new InMemoryAvailabilityRepository();
  });

  it('creates and finds by member', async () => {
    await repo.create({ memberId: 'm1', awayFrom: new Date('2024-01-01'), awayUntil: new Date('2024-01-07') });
    const records = await repo.findByMemberId('m1');
    expect(records).toHaveLength(1);
  });

  it('finds active availability for a date', async () => {
    await repo.create({ memberId: 'm1', awayFrom: new Date('2024-01-01'), awayUntil: new Date('2024-01-07') });
    const active = await repo.findActiveByMemberIdAndDate('m1', new Date('2024-01-03'));
    expect(active).not.toBeNull();
  });

  it('returns null when date is outside range', async () => {
    await repo.create({ memberId: 'm1', awayFrom: new Date('2024-01-01'), awayUntil: new Date('2024-01-07') });
    const active = await repo.findActiveByMemberIdAndDate('m1', new Date('2024-02-01'));
    expect(active).toBeNull();
  });

  it('deletes an availability', async () => {
    const created = await repo.create({ memberId: 'm1', awayFrom: new Date(), awayUntil: new Date() });
    await repo.delete(created.id);
    const records = await repo.findByMemberId('m1');
    expect(records).toHaveLength(0);
  });

  it('throws NotFoundError when deleting non-existent', async () => {
    await expect(repo.delete('missing')).rejects.toThrow(NotFoundError);
  });
});


describe('InMemorySessionAggregateRepository', () => {
  let repo: InMemorySessionAggregateRepository;

  beforeEach(() => {
    repo = new InMemorySessionAggregateRepository();
  });

  it('creates and finds by session', async () => {
    await repo.create({
      sessionId: 's1', questionId: 'q1', averageScore: 3.5,
      responseCount: 4, improvingCount: 2, stableCount: 1, decliningCount: 1,
    });
    const results = await repo.findBySessionId('s1');
    expect(results).toHaveLength(1);
    expect(results[0].averageScore).toBe(3.5);
  });

  it('finds by team using registered session mapping', async () => {
    repo.registerSessionTeam('s1', 'team-a');
    repo.registerSessionTeam('s2', 'team-b');
    await repo.create({ sessionId: 's1', questionId: 'q1', averageScore: 4, responseCount: 3, improvingCount: 1, stableCount: 1, decliningCount: 1 });
    await repo.create({ sessionId: 's2', questionId: 'q1', averageScore: 2, responseCount: 3, improvingCount: 0, stableCount: 2, decliningCount: 1 });

    const teamAResults = await repo.findByTeamId('team-a');
    expect(teamAResults).toHaveLength(1);
    expect(teamAResults[0].sessionId).toBe('s1');
  });
});

describe('InMemoryTeamMemberRoleRepository', () => {
  let repo: InMemoryTeamMemberRoleRepository;

  beforeEach(() => {
    repo = new InMemoryTeamMemberRoleRepository();
  });

  it('assigns a role', async () => {
    const role = await repo.assign({ memberId: 'm1', teamId: 't1', role: 'admin' });
    expect(role.id).toBeDefined();
    expect(role.role).toBe('admin');
  });

  it('finds roles by member and team', async () => {
    await repo.assign({ memberId: 'm1', teamId: 't1', role: 'admin' });
    await repo.assign({ memberId: 'm1', teamId: 't1', role: 'facilitator' });
    const roles = await repo.findByMemberAndTeam('m1', 't1');
    expect(roles).toHaveLength(2);
  });

  it('counts by team and role', async () => {
    await repo.assign({ memberId: 'm1', teamId: 't1', role: 'admin' });
    await repo.assign({ memberId: 'm2', teamId: 't1', role: 'admin' });
    await repo.assign({ memberId: 'm3', teamId: 't1', role: 'member' });
    const count = await repo.countByTeamAndRole('t1', 'admin');
    expect(count).toBe(2);
  });

  it('removes a role', async () => {
    await repo.assign({ memberId: 'm1', teamId: 't1', role: 'admin' });
    await repo.remove('m1', 't1', 'admin');
    const roles = await repo.findByMemberAndTeam('m1', 't1');
    expect(roles).toHaveLength(0);
  });
});

describe('InMemoryPairingCodeRepository', () => {
  let repo: InMemoryPairingCodeRepository;

  beforeEach(() => {
    repo = new InMemoryPairingCodeRepository();
  });

  it('creates and finds by code', async () => {
    await repo.create({ code: 'ABC123', slackUserId: 'U123', expiresAt: new Date(Date.now() + 60_000) });
    const found = await repo.findByCode('ABC123');
    expect(found).not.toBeNull();
    expect(found!.slackUserId).toBe('U123');
    expect(found!.used).toBe(false);
  });

  it('marks a code as used', async () => {
    const created = await repo.create({ code: 'XYZ', slackUserId: 'U1', expiresAt: new Date() });
    await repo.markUsed(created.id);
    const found = await repo.findByCode('XYZ');
    expect(found!.used).toBe(true);
  });

  it('throws NotFoundError when marking non-existent code', async () => {
    await expect(repo.markUsed('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('InMemoryUserSessionRepository', () => {
  let repo: InMemoryUserSessionRepository;

  beforeEach(() => {
    repo = new InMemoryUserSessionRepository();
  });

  it('creates and finds by token', async () => {
    await repo.create({ memberId: 'm1', token: 'sess-tok', expiresAt: new Date(Date.now() + 60_000) });
    const found = await repo.findByToken('sess-tok');
    expect(found).not.toBeNull();
    expect(found!.memberId).toBe('m1');
  });

  it('returns null for non-existent token', async () => {
    expect(await repo.findByToken('missing')).toBeNull();
  });
});
