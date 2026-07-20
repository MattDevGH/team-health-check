/**
 * Team membership authorization tests
 * Validates: Requirements 9.1, 9.2, 9.4
 *
 * Tests for authorizeTeamMember and authorizeDeliveryManager functions
 * that enforce team-level access control using repository lookups.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { createAuthorizeTeamMember, createAuthorizeDeliveryManager } from './authorize-team-member';
import { InMemoryTeamMemberRepository } from '../repositories/in-memory/team-member.repository';
import { InMemoryTeamMemberRoleRepository } from '../repositories/in-memory/team-member-role.repository';
import { ForbiddenError } from '../errors';

describe('authorizeTeamMember', () => {
  let teamMemberRepo: InMemoryTeamMemberRepository;
  let teamMemberRoleRepo: InMemoryTeamMemberRoleRepository;
  let authorizeTeamMember: (memberId: string, teamId: string) => Promise<void>;

  beforeEach(() => {
    teamMemberRepo = new InMemoryTeamMemberRepository();
    teamMemberRoleRepo = new InMemoryTeamMemberRoleRepository();
    authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo });
  });

  it('passes when member belongs to the team', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Alice',
      email: 'alice@example.com',
    });

    await expect(authorizeTeamMember(member.id, 'team-1')).resolves.toBeUndefined();
  });

  it('throws ForbiddenError when member does not exist', async () => {
    await expect(
      authorizeTeamMember('nonexistent-member', 'team-1')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when member belongs to a different team', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Bob',
      email: 'bob@example.com',
    });

    await expect(
      authorizeTeamMember(member.id, 'team-2')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError with descriptive message when access denied', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    await expect(
      authorizeTeamMember(member.id, 'team-2')
    ).rejects.toThrow('You do not have access to this team');
  });
});

describe('authorizeDeliveryManager', () => {
  let teamMemberRepo: InMemoryTeamMemberRepository;
  let teamMemberRoleRepo: InMemoryTeamMemberRoleRepository;
  let authorizeDeliveryManager: (memberId: string, teamId: string) => Promise<void>;

  beforeEach(() => {
    teamMemberRepo = new InMemoryTeamMemberRepository();
    teamMemberRoleRepo = new InMemoryTeamMemberRoleRepository();
    authorizeDeliveryManager = createAuthorizeDeliveryManager({ teamMemberRepo, teamMemberRoleRepo });
  });

  it('passes when member belongs to team and has delivery_manager role', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Diana',
      email: 'diana@example.com',
    });
    await teamMemberRoleRepo.assign({
      memberId: member.id,
      teamId: 'team-1',
      role: 'delivery_manager',
    });

    await expect(authorizeDeliveryManager(member.id, 'team-1')).resolves.toBeUndefined();
  });

  it('throws ForbiddenError when member does not exist', async () => {
    await expect(
      authorizeDeliveryManager('nonexistent-member', 'team-1')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when member belongs to a different team', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Eve',
      email: 'eve@example.com',
    });
    await teamMemberRoleRepo.assign({
      memberId: member.id,
      teamId: 'team-1',
      role: 'delivery_manager',
    });

    await expect(
      authorizeDeliveryManager(member.id, 'team-2')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when member belongs to team but lacks delivery_manager role', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Frank',
      email: 'frank@example.com',
    });

    await expect(
      authorizeDeliveryManager(member.id, 'team-1')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError with role-specific message when role is missing', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Grace',
      email: 'grace@example.com',
    });

    await expect(
      authorizeDeliveryManager(member.id, 'team-1')
    ).rejects.toThrow('Delivery manager role required');
  });

  it('throws ForbiddenError when member has a different role but not delivery_manager', async () => {
    const member = await teamMemberRepo.create({
      teamId: 'team-1',
      name: 'Hank',
      email: 'hank@example.com',
    });
    await teamMemberRoleRepo.assign({
      memberId: member.id,
      teamId: 'team-1',
      role: 'participant',
    });

    await expect(
      authorizeDeliveryManager(member.id, 'team-1')
    ).rejects.toThrow('Delivery manager role required');
  });
});
