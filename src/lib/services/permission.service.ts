/**
 * Permission check service.
 * Provides a reusable helper to enforce role-based access control.
 * Requirements: 19.8, 19.9
 */

import { ForbiddenError } from '@/lib/errors';
import type { TeamMemberRoleRepository } from '@/lib/repositories/types';

export interface PermissionServiceDeps {
  teamMemberRoleRepo: TeamMemberRoleRepository;
}

export interface PermissionService {
  requireRole(teamId: string, memberId: string, requiredRole: string): Promise<void>;
}

/**
 * Factory function for creating the permission service.
 */
export function createPermissionService(deps: PermissionServiceDeps): PermissionService {
  const { teamMemberRoleRepo } = deps;

  async function requireRole(teamId: string, memberId: string, requiredRole: string): Promise<void> {
    const roles = await teamMemberRoleRepo.findByMemberAndTeam(memberId, teamId);
    const hasRole = roles.some(r => r.role === requiredRole);
    if (!hasRole) {
      throw new ForbiddenError(`Requires role: ${requiredRole}`);
    }
  }

  return { requireRole };
}
