/**
 * Unit tests for role.service.ts
 * Tests role assignment and removal with minimum DM constraint.
 * Validates: Requirements 19.1, 19.5, 19.6, 19.7
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createRoleService } from '@/lib/services/role.service';
import { ForbiddenError, ConflictError } from '@/lib/errors';

describe('RoleService', () => {
  let repos: Repositories;
  let roleService: ReturnType<typeof createRoleService>;
  let teamId: string;
  let memberId: string;
  let actorId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    roleService = createRoleService({
      teamMemberRoleRepo: repos.teamMemberRole,
      auditLogRepo: repos.auditLog,
    });

    // Create a team and member for testing
    const team = await repos.team.create({ name: 'Test Team' });
    teamId = team.id;
    const member = await repos.teamMember.create({ teamId, name: 'Alice', email: 'alice@example.com' });
    memberId = member.id;
    const actor = await repos.teamMember.create({ teamId, name: 'Bob', email: 'bob@example.com' });
    actorId = actor.id;
  });

  describe('assignRole', () => {
    it('should assign a role to a team member', async () => {
      const role = await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);

      expect(role).toBeDefined();
      expect(role.memberId).toBe(memberId);
      expect(role.teamId).toBe(teamId);
      expect(role.role).toBe('delivery_manager');
    });

    it('should log an audit entry when assigning a role', async () => {
      await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);

      const auditEntries = await repos.auditLog.findByTeamId(teamId);
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].changeType).toBe('role_assigned');
      expect(auditEntries[0].newValue).toContain('delivery_manager');
      expect(auditEntries[0].userId).toBe(actorId);
    });

    it('should throw ConflictError if role already assigned', async () => {
      await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);

      await expect(
        roleService.assignRole(teamId, memberId, 'delivery_manager', actorId)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('removeRole', () => {
    it('should remove a non-last delivery_manager role', async () => {
      // Assign DM to two members
      await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);
      await roleService.assignRole(teamId, actorId, 'delivery_manager', actorId);

      // Remove from one — should succeed
      await roleService.removeRole(teamId, memberId, 'delivery_manager', actorId);

      const roles = await repos.teamMemberRole.findByMemberAndTeam(memberId, teamId);
      const dmRoles = roles.filter(r => r.role === 'delivery_manager');
      expect(dmRoles).toHaveLength(0);
    });

    it('should throw ForbiddenError when removing the last delivery_manager', async () => {
      // Only one DM
      await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);

      await expect(
        roleService.removeRole(teamId, memberId, 'delivery_manager', actorId)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should log an audit entry when removing a role', async () => {
      // Assign DM to two members
      await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);
      await roleService.assignRole(teamId, actorId, 'delivery_manager', actorId);

      await roleService.removeRole(teamId, memberId, 'delivery_manager', actorId);

      const auditEntries = await repos.auditLog.findByTeamId(teamId);
      const removeEntry = auditEntries.find(e => e.changeType === 'role_removed');
      expect(removeEntry).toBeDefined();
      expect(removeEntry!.previousValue).toContain('delivery_manager');
      expect(removeEntry!.userId).toBe(actorId);
    });

    it('should allow removing a team_member role without DM constraint', async () => {
      await roleService.assignRole(teamId, memberId, 'team_member', actorId);

      // Removing team_member role should not trigger the DM constraint
      await roleService.removeRole(teamId, memberId, 'team_member', actorId);

      const roles = await repos.teamMemberRole.findByMemberAndTeam(memberId, teamId);
      const tmRoles = roles.filter(r => r.role === 'team_member');
      expect(tmRoles).toHaveLength(0);
    });
  });
});
