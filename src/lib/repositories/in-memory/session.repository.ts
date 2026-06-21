/**
 * In-memory SessionRepository fake for unit testing.
 * Requirements: 3.2
 */

import type { HealthCheckSession } from '../entities';
import type { SessionRepository } from '../types';

export class InMemorySessionRepository implements SessionRepository {
  private sessions: Map<string, HealthCheckSession> = new Map();
  private nextId = 1;

  async create(data: {
    teamId: string;
    status: string;
    scheduledOpenAt?: Date;
    scheduledCloseAt?: Date;
  }): Promise<HealthCheckSession> {
    const now = new Date();
    const session: HealthCheckSession = {
      id: `session-${this.nextId++}`,
      teamId: data.teamId,
      status: data.status,
      scheduledOpenAt: data.scheduledOpenAt ?? null,
      scheduledCloseAt: data.scheduledCloseAt ?? null,
      actualOpenAt: now,
      actualCloseAt: null,
      createdAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<HealthCheckSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async findOpenByTeamId(teamId: string): Promise<HealthCheckSession | null> {
    const sessions = Array.from(this.sessions.values());
    return sessions.find(s => s.teamId === teamId && s.status === 'open') ?? null;
  }

  async findByTeamId(teamId: string): Promise<HealthCheckSession[]> {
    return Array.from(this.sessions.values()).filter(s => s.teamId === teamId);
  }

  async update(
    id: string,
    data: Partial<Pick<HealthCheckSession, 'status' | 'actualCloseAt'>>,
  ): Promise<HealthCheckSession> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    const updated: HealthCheckSession = { ...session, ...data };
    this.sessions.set(id, updated);
    return updated;
  }

  /** Exposes all sessions for cross-repo lookups in tests. */
  getAll(): HealthCheckSession[] {
    return Array.from(this.sessions.values());
  }
}
