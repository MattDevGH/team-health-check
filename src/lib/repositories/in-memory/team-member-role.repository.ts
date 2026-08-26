/** Requirement 19.1: Role-based access control */
import type { TeamRole } from '@/lib/contracts/member-summary';
import { ConflictError } from '@/lib/errors';

import type { TeamMemberRole } from '../entities';
import type { TeamMemberRoleRepository } from '../types';

interface MemberRoleRepositoryDeps {
  removeMember?: (memberId: string) => Promise<void>;
}

export class InMemoryTeamMemberRoleRepository implements TeamMemberRoleRepository {
  private store = new Map<string, TeamMemberRole>();

  constructor(private readonly deps: MemberRoleRepositoryDeps = {}) {}

  async assign(data: { memberId: string; teamId: string; role: string }): Promise<TeamMemberRole> {
    const existing = [...this.store.values()].find((entry) =>
      entry.memberId === data.memberId && entry.teamId === data.teamId && entry.role === data.role
    );
    if (existing) return existing;

    const role: TeamMemberRole = {
      id: crypto.randomUUID(),
      ...data,
      assignedAt: new Date(),
    };
    this.store.set(role.id, role);
    return role;
  }

  async replace(data: { memberId: string; teamId: string; role: TeamRole }): Promise<TeamMemberRole> {
    const current = await this.findByMemberAndTeam(data.memberId, data.teamId);
    if (current.some(({ role }) => role === 'delivery_manager') && data.role !== 'delivery_manager') {
      if (await this.countByTeamAndRole(data.teamId, 'delivery_manager') <= 1) {
        throw new ConflictError('At least one delivery manager must remain on the team');
      }
    }
    if (current.length === 1 && current[0].role === data.role) return current[0];

    for (const role of current) this.store.delete(role.id);
    return this.assign(data);
  }

  async remove(memberId: string, teamId: string, role: string): Promise<void> {
    for (const [id, entry] of this.store) {
      if (entry.memberId === memberId && entry.teamId === teamId && entry.role === role) this.store.delete(id);
    }
  }

  async removeMemberWithRoleProtection(memberId: string, teamId: string): Promise<void> {
    const roles = await this.findByMemberAndTeam(memberId, teamId);
    if (roles.some(({ role }) => role === 'delivery_manager') &&
        await this.countByTeamAndRole(teamId, 'delivery_manager') <= 1) {
      throw new ConflictError('Cannot remove the final delivery manager');
    }
    if (!this.deps.removeMember) throw new ConflictError('Member removal is not configured');
    await this.deps.removeMember(memberId);
    for (const role of roles) this.store.delete(role.id);
  }

  async findByMemberAndTeam(memberId: string, teamId: string): Promise<TeamMemberRole[]> {
    return [...this.store.values()].filter((role) => role.memberId === memberId && role.teamId === teamId);
  }

  async countByTeamAndRole(teamId: string, role: string): Promise<number> {
    return [...this.store.values()].filter((entry) => entry.teamId === teamId && entry.role === role).length;
  }
}
