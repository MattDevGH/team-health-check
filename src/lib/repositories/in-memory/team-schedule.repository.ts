/** Requirements 3.1, 18.1: Team schedule configuration and audit. */
import { NotFoundError } from '../../errors';
import type { TeamSchedule } from '../entities';
import type { AuditLogRepository, TeamScheduleRepository } from '../types';

type ScheduleData = Omit<TeamSchedule, 'id' | 'createdAt'>;
type SchedulePatch = Partial<Pick<
  TeamSchedule,
  'cadence' | 'openDay' | 'openTime' | 'closeDay' | 'closeTime' | 'timezone'
>>;

interface InMemoryTeamScheduleDeps {
  auditLogRepo: AuditLogRepository;
  updateTeamTimezone(teamId: string, timezone: string): Promise<void>;
}

export class InMemoryTeamScheduleRepository implements TeamScheduleRepository {
  private store = new Map<string, TeamSchedule>();

  constructor(private readonly deps: InMemoryTeamScheduleDeps) {}

  async create(data: ScheduleData): Promise<TeamSchedule> {
    await this.deps.updateTeamTimezone(data.teamId, data.timezone);
    return this.storeNew(data);
  }

  async findByTeamId(teamId: string): Promise<TeamSchedule | null> {
    return this.store.get(teamId) ?? null;
  }

  async update(teamId: string, data: SchedulePatch): Promise<TeamSchedule> {
    const existing = this.store.get(teamId);
    if (!existing) {
      throw new NotFoundError(`Schedule not found for team: ${teamId}`);
    }
    if (data.timezone !== undefined) {
      await this.deps.updateTeamTimezone(teamId, data.timezone);
    }
    const updated: TeamSchedule = { ...existing, ...data };
    this.store.set(teamId, updated);
    return updated;
  }

  async saveWithAudit(
    data: ScheduleData,
    audit: {
      changeType: string;
      previousValue: string;
      newValue: string;
      userId: string;
    },
  ): Promise<TeamSchedule> {
    // Audit first so a failed mandatory append cannot leave changed fake state.
    await this.deps.auditLogRepo.create({ teamId: data.teamId, ...audit });
    await this.deps.updateTeamTimezone(data.teamId, data.timezone);

    const existing = this.store.get(data.teamId);
    if (!existing) return this.storeNew(data);

    const updated = { ...existing, ...data };
    this.store.set(data.teamId, updated);
    return updated;
  }

  private storeNew(data: ScheduleData): TeamSchedule {
    const schedule: TeamSchedule = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.store.set(data.teamId, schedule);
    return schedule;
  }
}
