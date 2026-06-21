/** Requirement 3.1: Team schedule configuration */
import type { TeamSchedule } from '../entities';
import type { TeamScheduleRepository } from '../types';
import { NotFoundError } from '../../errors';

export class InMemoryTeamScheduleRepository implements TeamScheduleRepository {
  private store = new Map<string, TeamSchedule>();

  async create(data: {
    teamId: string;
    cadence: string;
    openDay: number;
    openTime: string;
    closeDay: number;
    closeTime: string;
    timezone: string;
  }): Promise<TeamSchedule> {
    const schedule: TeamSchedule = {
      id: crypto.randomUUID(),
      teamId: data.teamId,
      cadence: data.cadence,
      openDay: data.openDay,
      openTime: data.openTime,
      closeDay: data.closeDay,
      closeTime: data.closeTime,
      timezone: data.timezone,
      createdAt: new Date(),
    };
    this.store.set(data.teamId, schedule);
    return schedule;
  }

  async findByTeamId(teamId: string): Promise<TeamSchedule | null> {
    return this.store.get(teamId) ?? null;
  }

  async update(
    teamId: string,
    data: Partial<Pick<TeamSchedule, 'cadence' | 'openDay' | 'openTime' | 'closeDay' | 'closeTime' | 'timezone'>>
  ): Promise<TeamSchedule> {
    const existing = this.store.get(teamId);
    if (!existing) {
      throw new NotFoundError(`Schedule not found for team: ${teamId}`);
    }
    const updated: TeamSchedule = { ...existing, ...data };
    this.store.set(teamId, updated);
    return updated;
  }
}
