import type { Team } from '../entities';
import type { TeamRepository } from '../types';
import { NotFoundError } from '../../errors';

export class InMemoryTeamRepository implements TeamRepository {
  private store = new Map<string, Team>();

  async create(data: { name: string; description?: string; privacyMode?: string; timezone?: string }): Promise<Team> {
    const now = new Date();
    const team: Team = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description ?? null,
      privacyMode: data.privacyMode ?? 'anonymous',
      archived: false,
      slackDeliveryStart: null,
      slackDeliveryEnd: null,
      timezone: data.timezone ?? 'Europe/London',
      preSessionRecipient: 'delivery_manager',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(team.id, team);
    return team;
  }

  async findById(id: string): Promise<Team | null> {
    return this.store.get(id) ?? null;
  }

  async update(
    id: string,
    data: Partial<Pick<Team, 'name' | 'description' | 'privacyMode' | 'archived' | 'slackDeliveryStart' | 'slackDeliveryEnd' | 'timezone' | 'preSessionRecipient'>>
  ): Promise<Team> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundError(`Team not found: ${id}`);
    }
    const updated: Team = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async list(): Promise<Team[]> {
    return Array.from(this.store.values());
  }
}
