/**
 * Team membership and role authorization helpers.
 * Uses factory pattern for dependency injection — services depend on
 * repository interfaces, never on Prisma directly.
 *
 * Validates: Requirements 9.1, 9.2, 9.4
 */
import type { TeamMemberRepository, TeamMemberRoleRepository } from '@/lib/repositories/types';
import { ForbiddenError } from '@/lib/errors';

export interface AuthorizeTeamMemberDeps {
  teamMemberRepo: TeamMemberRepository;
}

export interface AuthorizeDeliveryManagerDeps {
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
}

/**
 * Factory: creates an authorizeTeamMember function that verifies
 * the given member belongs to the specified team.
 *
 * Throws ForbiddenError if the member does not exist or belongs
 * to a different team.
 */
export function createAuthorizeTeamMember(deps: AuthorizeTeamMemberDeps) {
  return async function authorizeTeamMember(memberId: string, teamId: string): Promise<void> {
    const member = await deps.teamMemberRepo.findById(memberId);
    if (!member || member.teamId !== teamId) {
      throw new ForbiddenError('You do not have access to this team');
    }
  };
}

/**
 * Factory: creates an authorizeDeliveryManager function that verifies
 * the given member belongs to the team AND holds the delivery_manager role.
 *
 * Throws ForbiddenError if membership check fails or role is missing.
 */
export function createAuthorizeDeliveryManager(deps: AuthorizeDeliveryManagerDeps) {
  const authorizeTeamMember = createAuthorizeTeamMember({ teamMemberRepo: deps.teamMemberRepo });

  return async function authorizeDeliveryManager(memberId: string, teamId: string): Promise<void> {
    await authorizeTeamMember(memberId, teamId);
    const roles = await deps.teamMemberRoleRepo.findByMemberAndTeam(memberId, teamId);
    const isManager = roles.some(r => r.role === 'delivery_manager');
    if (!isManager) {
      throw new ForbiddenError('Delivery manager role required');
    }
  };
}
