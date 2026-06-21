/** Requirement 19.1: Role-based access control */
import type { TeamMemberRole } from '../entities';
import type { TeamMemberRoleRepository } from '../types';

export class InMemoryTeamMemberRoleRepository implements TeamMemberRoleRepository {
  private store = new Map<string, TeamMemberRole>();

  async assign(data: { memberId: string; teamId: string; role: string }): Promise<TeamMemberRole> {
    const role: TeamMemberRole = {
      id: crypto.randomUUID(),
      memberId: data.memberId,
      teamId: data.teamId,
      role: data.role,
      assignedAt: new Date(),
    };
    this.store.set(role.id, role);
    return role;
  }

  async remove(memberId: string, teamId: string, role: string): Promise<void> {
    const entry = [...this.store.values()].find(
      r => r.memberId === memberId && r.teamId === teamId && r.role === role
    );
    if (entry) {
      this.store.delete(entry.id);
    }
  }

  async findByMemberAndTeam(memberId: string, teamId: string): Promise<TeamMemberRole[]> {
    return [...this.store.values()].filter(
      r => r.memberId === memberId && r.teamId === teamId
    );
  }

  async countByTeamAndRole(teamId: string, role: string): Promise<number> {
    return [...this.store.values()].filter(
      r => r.teamId === teamId && r.role === role
    ).length;
  }
}
