import type { TeamMember } from '../entities';
import type { TeamMemberRepository } from '../types';
import { ConflictError, NotFoundError } from '../../errors';

export class InMemoryTeamMemberRepository implements TeamMemberRepository {
  private store = new Map<string, TeamMember>();

  async create(data: { id?: string; teamId: string; name: string; email?: string }): Promise<TeamMember> {
    const email = data.email ?? null;

    // Enforce uniqueness on (teamId, name, email)
    const members = Array.from(this.store.values());
    const duplicate = members.find(
      (m) => m.teamId === data.teamId && m.name === data.name && m.email === email
    );
    if (duplicate) {
      throw new ConflictError(
        `Member with name "${data.name}" and email "${email}" already exists in team "${data.teamId}"`
      );
    }

    const member: TeamMember = {
      id: data.id ?? crypto.randomUUID(),
      teamId: data.teamId,
      name: data.name,
      email,
      cadencePreference: 'weekly',
      remindersEnabled: true,
      currentStreak: 0,
      bestStreak: 0,
      lastStreakSessionClose: null,
      createdAt: new Date(),
    };
    this.store.set(member.id, member);
    return member;
  }

  async findById(id: string): Promise<TeamMember | null> {
    return this.store.get(id) ?? null;
  }

  async findByTeamId(teamId: string): Promise<TeamMember[]> {
    return Array.from(this.store.values()).filter((m) => m.teamId === teamId);
  }

  async findByTeamAndNameEmail(teamId: string, name: string, email?: string): Promise<TeamMember | null> {
    const target = email ?? null;
    const members = Array.from(this.store.values());
    return members.find((m) => m.teamId === teamId && m.name === name && m.email === target) ?? null;
  }

  async findByEmail(email: string): Promise<TeamMember | null> {
    const members = Array.from(this.store.values());
    return members.find((m) => m.email === email) ?? null;
  }

  async update(
    id: string,
    data: Partial<Pick<TeamMember, 'name' | 'email' | 'cadencePreference' | 'remindersEnabled' | 'currentStreak' | 'bestStreak' | 'lastStreakSessionClose'>>
  ): Promise<TeamMember> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundError(`TeamMember not found: ${id}`);
    }
    const updated: TeamMember = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new NotFoundError(`TeamMember not found: ${id}`);
    }
    this.store.delete(id);
  }
}
