import type { TeamRole } from '@/lib/contracts/member-summary';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { PrismaClient } from '@/generated/prisma';

import type { TeamMemberRole } from '../entities';
import type { TeamMemberRoleRepository } from '../types';

/** Prisma role operations keep replacement and final-manager checks transactional. */
export class PrismaTeamMemberRoleRepository implements TeamMemberRoleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async assign(data: { memberId: string; teamId: string; role: string }): Promise<TeamMemberRole> {
    const record = await this.prisma.teamMemberRole.upsert({
      where: { memberId_teamId_role: data },
      create: data,
      update: {},
    });
    return this.map(record);
  }

  async replace(data: { memberId: string; teamId: string; role: TeamRole }): Promise<TeamMemberRole> {
    const record = await this.prisma.$transaction(async (tx) => {
      const current = await tx.teamMemberRole.findMany({
        where: { memberId: data.memberId, teamId: data.teamId },
      });
      if (current.some(({ role }) => role === 'delivery_manager') && data.role !== 'delivery_manager') {
        const managers = await tx.teamMemberRole.count({ where: { teamId: data.teamId, role: 'delivery_manager' } });
        if (managers <= 1) throw new ConflictError('At least one delivery manager must remain on the team');
      }
      if (current.length === 1 && current[0].role === data.role) return current[0];
      await tx.teamMemberRole.deleteMany({ where: { memberId: data.memberId, teamId: data.teamId } });
      return tx.teamMemberRole.create({ data });
    });
    return this.map(record);
  }

  async remove(memberId: string, teamId: string, role: string): Promise<void> {
    await this.prisma.teamMemberRole.deleteMany({ where: { memberId, teamId, role } });
  }

  async removeMemberWithRoleProtection(memberId: string, teamId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.teamMember.findFirst({ where: { id: memberId, teamId } });
      if (!member) throw new NotFoundError('Team member not found in this team');
      const roles = await tx.teamMemberRole.findMany({ where: { memberId, teamId } });
      if (roles.some(({ role }) => role === 'delivery_manager')) {
        const managers = await tx.teamMemberRole.count({ where: { teamId, role: 'delivery_manager' } });
        if (managers <= 1) throw new ConflictError('Cannot remove the final delivery manager');
      }
      if (await tx.response.count({ where: { memberId } }) > 0) {
        throw new ConflictError('This member has historical responses and cannot be removed with the current data model');
      }
      await tx.slackIdentityLink.deleteMany({ where: { memberId } });
      await tx.availability.deleteMany({ where: { memberId } });
      await tx.sessionLink.deleteMany({ where: { memberId } });
      await tx.magicLink.deleteMany({ where: { memberId } });
      await tx.userSession.deleteMany({ where: { memberId } });
      await tx.teamMemberRole.deleteMany({ where: { memberId, teamId } });
      await tx.teamMember.delete({ where: { id: memberId } });
    });
  }

  async findByMemberAndTeam(memberId: string, teamId: string): Promise<TeamMemberRole[]> {
    return (await this.prisma.teamMemberRole.findMany({ where: { memberId, teamId } })).map((record) => this.map(record));
  }

  async countByTeamAndRole(teamId: string, role: string): Promise<number> {
    return this.prisma.teamMemberRole.count({ where: { teamId, role } });
  }

  private map(record: { id: string; memberId: string; teamId: string; role: string; assignedAt: Date }): TeamMemberRole {
    return record;
  }
}
