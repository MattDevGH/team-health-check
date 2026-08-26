import type { PrismaClient, TeamMember as PrismaTeamMember } from '@/generated/prisma';
import type { TeamMember } from '../entities';
import type { TeamMemberRepository } from '../types';
import { ConflictError, NotFoundError } from '../../errors';

/**
 * Prisma-backed implementation of TeamMemberRepository.
 * Requirements: 1.3 (team member management)
 */
export class PrismaTeamMemberRepository implements TeamMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    id?: string;
    teamId: string;
    name: string;
    email?: string;
  }): Promise<TeamMember> {
    const email = data.email ?? null;

    try {
      const record = await this.prisma.teamMember.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          teamId: data.teamId,
          name: data.name,
          email,
        },
      });
      return this.mapToEntity(record);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictError(
          `Member with name "${data.name}" and email "${email}" already exists in team "${data.teamId}"`
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<TeamMember | null> {
    const record = await this.prisma.teamMember.findUnique({ where: { id } });
    return record ? this.mapToEntity(record) : null;
  }

  async findByTeamId(teamId: string): Promise<TeamMember[]> {
    const records = await this.prisma.teamMember.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((r) => this.mapToEntity(r));
  }

  async findByTeamAndNameEmail(
    teamId: string,
    name: string,
    email?: string
  ): Promise<TeamMember | null> {
    const targetEmail = email ?? null;
    const record = await this.prisma.teamMember.findFirst({
      where: {
        teamId,
        name,
        email: targetEmail,
      },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async findByEmail(email: string): Promise<TeamMember | null> {
    const record = await this.prisma.teamMember.findFirst({
      where: { email },
    });
    return record ? this.mapToEntity(record) : null;
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        TeamMember,
        | 'name'
        | 'email'
        | 'cadencePreference'
        | 'remindersEnabled'
        | 'currentStreak'
        | 'bestStreak'
        | 'lastStreakSessionClose'
      >
    >
  ): Promise<TeamMember> {
    const existing = await this.prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`TeamMember not found: ${id}`);
    }

    const record = await this.prisma.teamMember.update({
      where: { id },
      data,
    });
    return this.mapToEntity(record);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`TeamMember not found: ${id}`);
    }

    await this.prisma.teamMember.delete({ where: { id } });
  }

  private mapToEntity(record: PrismaTeamMember): TeamMember {
    return {
      id: record.id,
      teamId: record.teamId,
      name: record.name,
      email: record.email,
      cadencePreference: record.cadencePreference,
      remindersEnabled: record.remindersEnabled,
      currentStreak: record.currentStreak,
      bestStreak: record.bestStreak,
      lastStreakSessionClose: record.lastStreakSessionClose,
      createdAt: record.createdAt,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
