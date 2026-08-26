import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTeamRepository } from './team.repository';
import { InMemoryTeamMemberRepository } from './team-member.repository';
import { ConflictError, NotFoundError } from '../../errors';

describe('InMemoryTeamRepository', () => {
  let repo: InMemoryTeamRepository;

  beforeEach(() => {
    repo = new InMemoryTeamRepository();
  });

  it('creates a team with defaults', async () => {
    const team = await repo.create({ name: 'Alpha' });
    expect(team.id).toBeDefined();
    expect(team.name).toBe('Alpha');
    expect(team.description).toBeNull();
    expect(team.privacyMode).toBe('anonymous');
    expect(team.archived).toBe(false);
    expect(team.timezone).toBe('Europe/London');
    expect(team.createdAt).toBeInstanceOf(Date);
    expect(team.updatedAt).toBeInstanceOf(Date);
  });

  it('creates a team with provided values', async () => {
    const team = await repo.create({
      name: 'Beta',
      description: 'Test team',
      privacyMode: 'identified',
      timezone: 'US/Eastern',
    });
    expect(team.name).toBe('Beta');
    expect(team.description).toBe('Test team');
    expect(team.privacyMode).toBe('identified');
    expect(team.timezone).toBe('US/Eastern');
  });

  it('finds a team by id', async () => {
    const created = await repo.create({ name: 'Gamma' });
    const found = await repo.findById(created.id);
    expect(found).toEqual(created);
  });

  it('returns null for non-existent id', async () => {
    const found = await repo.findById('no-such-id');
    expect(found).toBeNull();
  });

  it('updates a team', async () => {
    const created = await repo.create({ name: 'Delta' });
    const updated = await repo.update(created.id, { name: 'Delta v2', archived: true });
    expect(updated.name).toBe('Delta v2');
    expect(updated.archived).toBe(true);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('throws NotFoundError when updating non-existent team', async () => {
    await expect(repo.update('missing', { name: 'X' })).rejects.toThrow(NotFoundError);
  });

  it('lists all teams', async () => {
    await repo.create({ name: 'One' });
    await repo.create({ name: 'Two' });
    const all = await repo.list();
    expect(all).toHaveLength(2);
  });
});

describe('InMemoryTeamMemberRepository', () => {
  let repo: InMemoryTeamMemberRepository;

  beforeEach(() => {
    repo = new InMemoryTeamMemberRepository();
  });

  it('creates a member with defaults', async () => {
    const member = await repo.create({ teamId: 't1', name: 'Alice' });
    expect(member.id).toBeDefined();
    expect(member.teamId).toBe('t1');
    expect(member.name).toBe('Alice');
    expect(member.email).toBeNull();
    expect(member.cadencePreference).toBe('weekly');
    expect(member.remindersEnabled).toBe(true);
    expect(member.currentStreak).toBe(0);
    expect(member.bestStreak).toBe(0);
    expect(member.lastStreakSessionClose).toBeNull();
    expect(member.createdAt).toBeInstanceOf(Date);
  });

  it('creates a member with email', async () => {
    const member = await repo.create({ teamId: 't1', name: 'Bob', email: 'bob@test.com' });
    expect(member.email).toBe('bob@test.com');
  });

  it('throws ConflictError on duplicate (teamId, name, email)', async () => {
    await repo.create({ teamId: 't1', name: 'Alice', email: 'alice@test.com' });
    await expect(
      repo.create({ teamId: 't1', name: 'Alice', email: 'alice@test.com' })
    ).rejects.toThrow(ConflictError);
  });

  it('allows same name with different email in same team', async () => {
    await repo.create({ teamId: 't1', name: 'Alice', email: 'alice1@test.com' });
    const member = await repo.create({ teamId: 't1', name: 'Alice', email: 'alice2@test.com' });
    expect(member.name).toBe('Alice');
  });

  it('allows same name and email in different teams', async () => {
    await repo.create({ teamId: 't1', name: 'Alice', email: 'alice@test.com' });
    const member = await repo.create({ teamId: 't2', name: 'Alice', email: 'alice@test.com' });
    expect(member.teamId).toBe('t2');
  });

  it('finds a member by id', async () => {
    const created = await repo.create({ teamId: 't1', name: 'Charlie' });
    const found = await repo.findById(created.id);
    expect(found).toEqual(created);
  });

  it('returns null for non-existent member id', async () => {
    const found = await repo.findById('missing');
    expect(found).toBeNull();
  });

  it('finds members by teamId', async () => {
    await repo.create({ teamId: 't1', name: 'A' });
    await repo.create({ teamId: 't1', name: 'B' });
    await repo.create({ teamId: 't2', name: 'C' });
    const members = await repo.findByTeamId('t1');
    expect(members).toHaveLength(2);
  });

  it('finds by team, name, and email', async () => {
    await repo.create({ teamId: 't1', name: 'Dana', email: 'dana@test.com' });
    const found = await repo.findByTeamAndNameEmail('t1', 'Dana', 'dana@test.com');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Dana');
  });

  it('returns null when no match for findByTeamAndNameEmail', async () => {
    const found = await repo.findByTeamAndNameEmail('t1', 'Nobody');
    expect(found).toBeNull();
  });

  it('finds by email', async () => {
    await repo.create({ teamId: 't1', name: 'Eve', email: 'eve@test.com' });
    const found = await repo.findByEmail('eve@test.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('eve@test.com');
  });

  it('returns null for non-existent email', async () => {
    const found = await repo.findByEmail('nobody@test.com');
    expect(found).toBeNull();
  });

  it('updates a member', async () => {
    const created = await repo.create({ teamId: 't1', name: 'Frank' });
    const updated = await repo.update(created.id, { name: 'Franklin', currentStreak: 5 });
    expect(updated.name).toBe('Franklin');
    expect(updated.currentStreak).toBe(5);
  });

  it('throws NotFoundError when updating non-existent member', async () => {
    await expect(repo.update('missing', { name: 'X' })).rejects.toThrow(NotFoundError);
  });

  it('removes a member', async () => {
    const created = await repo.create({ teamId: 't1', name: 'Gina' });
    await repo.remove(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('throws NotFoundError when removing non-existent member', async () => {
    await expect(repo.remove('missing')).rejects.toThrow(NotFoundError);
  });
});
