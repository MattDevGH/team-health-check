/**
 * Unit tests for permission.service.ts
 * Tests role-based permission checking.
 * Validates: Requirements 19.8, 19.9
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createPermissionService } from '@/lib/services/permission.service';
import { ForbiddenError } from '@/lib/errors';

describe('PermissionService', () => {
  let repos: Repositories;
  let permissionService: ReturnType<typeof createPermissionService>;
  let teamId: string;
  let dmMemberId: string;
  let regularMemberId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    permissionService = createPermissionService({
      teamMemberRoleRepo: repos.teamMemberRole,
    });

    // Create a team and members
    const team = await repos.team.create({ name: 'Test Team' });
    teamId = team.id;

    const dmMember = await repos.teamMember.create({ teamId, name: 'DM User', email: 'dm@example.com' });
    dmMemberId = dmMember.id;

    const regularMember = await repos.teamMember.create({ teamId, name: 'Regular User', email: 'regular@example.com' });
    regularMemberId = regularMember.id;

    // Assign roles
    await repos.teamMemberRole.assign({ memberId: dmMemberId, teamId, role: 'delivery_manager' });
    await repos.teamMemberRole.assign({ memberId: regularMemberId, teamId, role: 'team_member' });
  });

  describe('requireRole', () => {
    it('should not throw when member has the required role', async () => {
      await expect(
        permissionService.requireRole(teamId, dmMemberId, 'delivery_manager')
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenError when member lacks the required role', async () => {
      await expect(
        permissionService.requireRole(teamId, regularMemberId, 'delivery_manager')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError with descriptive message including the required role', async () => {
      await expect(
        permissionService.requireRole(teamId, regularMemberId, 'delivery_manager')
      ).rejects.toThrow('Requires role: delivery_manager');
    });

    it('should throw ForbiddenError when member has a different role than required', async () => {
      // regularMember has 'team_member' but we require 'delivery_manager'
      await expect(
        permissionService.requireRole(teamId, regularMemberId, 'delivery_manager')
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
