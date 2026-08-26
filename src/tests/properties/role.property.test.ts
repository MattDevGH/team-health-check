import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createRoleService } from '@/lib/services/role.service';
import { ForbiddenError } from '@/lib/errors';

/**
 * Property tests for role-based access control.
 * Validates: Requirements 19.2, 19.3, 19.6, 19.7, 19.8, 19.9
 */
describe('Role-Based Access Control Properties', () => {
  /**
   * **Validates: Requirements 19.2, 19.3**
   *
   * Property 25: Role-based access control enforcement
   *
   * For any user holding only the team_member role, attempting any
   * delivery_manager-only action SHALL be rejected. At the service level,
   * the core RBAC enforcement is the delivery_manager constraint on role removal.
   *
   * Since we don't have a full permission middleware yet, we test that the role
   * service correctly enforces the DM constraint — which is the core RBAC
   * enforcement at the service level.
   */
  describe('Property 25: Role-based access control enforcement', () => {
    it('only delivery_manager role removal is constrained by the last-DM check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 9 }),
          async (memberCount, targetIndex) => {
            const repos = createInMemoryRepositories();
            const roleService = createRoleService({
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
            });

            const teamId = `team-${crypto.randomUUID()}`;
            const actorId = `actor-${crypto.randomUUID()}`;
            const memberIds = Array.from({ length: memberCount }, () =>
              `member-${crypto.randomUUID()}`
            );

            // Assign team_member role to all members
            for (const memberId of memberIds) {
              await roleService.assignRole(teamId, memberId, 'team_member', actorId);
            }

            // Assign delivery_manager to exactly one member (the first one)
            await roleService.assignRole(teamId, memberIds[0], 'delivery_manager', actorId);

            // Removing team_member role from any member should succeed
            // (team_member removals are not constrained by the DM check)
            const safeTargetIdx = targetIndex % memberCount;
            await roleService.removeRole(
              teamId,
              memberIds[safeTargetIdx],
              'team_member',
              actorId
            );

            // Removing delivery_manager from the sole DM should be rejected
            await expect(
              roleService.removeRole(teamId, memberIds[0], 'delivery_manager', actorId)
            ).rejects.toThrow(ForbiddenError);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('delivery_manager role assignment succeeds for any valid member', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (memberCount) => {
            const repos = createInMemoryRepositories();
            const roleService = createRoleService({
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
            });

            const teamId = `team-${crypto.randomUUID()}`;
            const actorId = `actor-${crypto.randomUUID()}`;
            const memberIds = Array.from({ length: memberCount }, () =>
              `member-${crypto.randomUUID()}`
            );

            // Assigning delivery_manager to any member should always succeed
            for (const memberId of memberIds) {
              const result = await roleService.assignRole(
                teamId,
                memberId,
                'delivery_manager',
                actorId
              );
              expect(result.role).toBe('delivery_manager');
              expect(result.memberId).toBe(memberId);
              expect(result.teamId).toBe(teamId);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * **Validates: Requirements 19.6, 19.7**
   *
   * Property 26: Minimum one delivery manager constraint
   *
   * For any team with N delivery managers (N >= 2), attempting to remove all
   * of them sequentially SHALL succeed for the first N-1 removals and SHALL
   * fail for the last one with a ForbiddenError. After all attempts, exactly
   * one delivery_manager remains.
   */
  describe('Property 26: Minimum one delivery manager constraint', () => {
    it('removing DMs sequentially: exactly N-1 succeed, last fails with ForbiddenError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (dmCount) => {
            const repos = createInMemoryRepositories();
            const roleService = createRoleService({
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
            });

            const teamId = `team-${crypto.randomUUID()}`;
            const actorId = `actor-${crypto.randomUUID()}`;
            const memberIds = Array.from({ length: dmCount }, () =>
              `member-${crypto.randomUUID()}`
            );

            // Assign delivery_manager to all N members
            for (const memberId of memberIds) {
              await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);
            }

            // Attempt to remove DM role from all N members sequentially
            let successCount = 0;
            let failureCount = 0;

            for (const memberId of memberIds) {
              try {
                await roleService.removeRole(teamId, memberId, 'delivery_manager', actorId);
                successCount++;
              } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenError);
                failureCount++;
              }
            }

            // Exactly N-1 removals should succeed, 1 should fail
            expect(successCount).toBe(dmCount - 1);
            expect(failureCount).toBe(1);

            // Verify exactly 1 delivery_manager remains
            const remainingDmCount = await repos.teamMemberRole.countByTeamAndRole(
              teamId,
              'delivery_manager'
            );
            expect(remainingDmCount).toBe(1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('a single delivery_manager cannot be removed regardless of team size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (teamMemberCount) => {
            const repos = createInMemoryRepositories();
            const roleService = createRoleService({
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
            });

            const teamId = `team-${crypto.randomUUID()}`;
            const actorId = `actor-${crypto.randomUUID()}`;
            const dmId = `member-${crypto.randomUUID()}`;

            // Create one DM
            await roleService.assignRole(teamId, dmId, 'delivery_manager', actorId);

            // Create additional team_member-only users
            for (let i = 0; i < teamMemberCount; i++) {
              const memberId = `member-${crypto.randomUUID()}`;
              await roleService.assignRole(teamId, memberId, 'team_member', actorId);
            }

            // Attempting to remove the sole DM should always fail
            await expect(
              roleService.removeRole(teamId, dmId, 'delivery_manager', actorId)
            ).rejects.toThrow(ForbiddenError);

            // DM still has the role
            const remaining = await repos.teamMemberRole.countByTeamAndRole(
              teamId,
              'delivery_manager'
            );
            expect(remaining).toBe(1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('removal order does not matter — exactly one DM always survives', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 8 }),
          async (dmCount) => {
            const repos = createInMemoryRepositories();
            const roleService = createRoleService({
              teamMemberRoleRepo: repos.teamMemberRole,
              auditLogRepo: repos.auditLog,
            });

            const teamId = `team-${crypto.randomUUID()}`;
            const actorId = `actor-${crypto.randomUUID()}`;
            const memberIds = Array.from({ length: dmCount }, () =>
              `member-${crypto.randomUUID()}`
            );

            // Assign delivery_manager to all members
            for (const memberId of memberIds) {
              await roleService.assignRole(teamId, memberId, 'delivery_manager', actorId);
            }

            // Shuffle the member IDs to create a random removal order
            const shuffled = [...memberIds].sort(() => Math.random() - 0.5);

            // Remove in shuffled order
            for (const memberId of shuffled) {
              try {
                await roleService.removeRole(teamId, memberId, 'delivery_manager', actorId);
              } catch {
                // Expected for the last DM
              }
            }

            // Regardless of order, exactly 1 DM remains
            const remaining = await repos.teamMemberRole.countByTeamAndRole(
              teamId,
              'delivery_manager'
            );
            expect(remaining).toBe(1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
