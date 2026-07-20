/**
 * Prisma-backed implementation of TeamMemberRoleRepository.
 * Requirement 19.1: Role-based access control
 */

import type { PrismaClient } from '@/generated/prisma';
import type { TeamMemberRole } from '../entities';
import type { TeamMemberRoleRepository } from '../types';

export class PrismaTeamMemberRoleRepository implements TeamMemberRoleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async assign(data: { memberId: string; teamId: string; role: string }): Promise<TeamMemberRole> {
    const record = await this.prisma.teamMemberRole.create({
      data: {
        memberId: data.memberId,
        teamId: data.teamId,
        role: data.role,
      },
    });
    return this.mapToEntity(record);
  }

  async remove(memberId: string, teamId: string, role: string): Promise<void> {
    await this.prisma.teamMemberRole.deleteMany({
      where: { memberId, teamId, role },
    });
  }

  async findByMemberAndTeam(memberId: string, teamId: string): Promise<TeamMemberRole[]> {
    const records = await this.prisma.teamMemberRole.findMany({
      where: { memberId, teamId },
    });
    return records.map(r => this.mapToEntity(r));
  }

  async countByTeamAndRole(teamId: string, role: string): Promise<number> {
    return this.prisma.teamMemberRole.count({
      where: { teamId, role },
    });
  }

  private mapToEntity(record: { id: string; memberId: string; teamId: string; role: string; assignedAt: Date }): TeamMemberRole {
    return {
      id: record.id,
      memberId: record.memberId,
      teamId: record.teamId,
      role: record.role,
      assignedAt: record.assignedAt,
    };
  }
}
