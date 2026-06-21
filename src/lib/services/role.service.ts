/**
 * Role management service.
 * Requirements: 19.1, 19.5, 19.6, 19.7
 */

import { ForbiddenError, ConflictError } from '@/lib/errors';
import type { TeamMemberRoleRepository, AuditLogRepository } from '@/lib/repositories/types';
import type { TeamMemberRole } from '@/lib/repositories/entities';

export interface RoleServiceDeps {
  teamMemberRoleRepo: TeamMemberRoleRepository;
  auditLogRepo: AuditLogRepository;
}

export interface RoleService {
  assignRole(teamId: string, memberId: string, role: string, actorId: string): Promise<TeamMemberRole>;
  removeRole(teamId: string, memberId: string, role: string, actorId: string): Promise<void>;
}

/**
 * Factory function for creating the role service.
 */
export function createRoleService(deps: RoleServiceDeps): RoleService {
  const { teamMemberRoleRepo, auditLogRepo } = deps;

  async function assignRole(teamId: string, memberId: string, role: string, actorId: string): Promise<TeamMemberRole> {
    // Check if role already assigned
    const existingRoles = await teamMemberRoleRepo.findByMemberAndTeam(memberId, teamId);
    const alreadyAssigned = existingRoles.find(r => r.role === role);
    if (alreadyAssigned) {
      throw new ConflictError(`Role "${role}" is already assigned to member "${memberId}"`);
    }

    const assigned = await teamMemberRoleRepo.assign({ memberId, teamId, role });

    await auditLogRepo.create({
      teamId,
      changeType: 'role_assigned',
      previousValue: '',
      newValue: JSON.stringify({ memberId, role }),
      userId: actorId,
    });

    return assigned;
  }

  async function removeRole(teamId: string, memberId: string, role: string, actorId: string): Promise<void> {
    // Enforce minimum one delivery_manager constraint
    if (role === 'delivery_manager') {
      const dmCount = await teamMemberRoleRepo.countByTeamAndRole(teamId, 'delivery_manager');
      if (dmCount <= 1) {
        throw new ForbiddenError('Cannot remove the last delivery manager from a team');
      }
    }

    await teamMemberRoleRepo.remove(memberId, teamId, role);

    await auditLogRepo.create({
      teamId,
      changeType: 'role_removed',
      previousValue: JSON.stringify({ memberId, role }),
      newValue: '',
      userId: actorId,
    });
  }

  return { assignRole, removeRole };
}
