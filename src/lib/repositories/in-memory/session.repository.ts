/**
 * In-memory SessionRepository fake for unit testing.
 * Requirements: 3.2
 */

import type { HealthCheckSession } from '../entities';
import type { SessionRepository } from '../types';

/** What the fake needs in order to write aggregates alongside a session. */
export interface InMemoryAggregateStore {
  create(data: {
    sessionId: string;
    questionId: string;
    averageScore: number;
    responseCount: number;
    improvingCount: number;
    stableCount: number;
    decliningCount: number;
  }): Promise<unknown>;
  deleteBySessionId(sessionId: string): Promise<number>;
}

export class InMemorySessionRepository implements SessionRepository {
  /**
   * Set by `createInMemoryRepositories`, because materialising writes to two
   * stores and the real implementation does it in one transaction.
   */
  private aggregateStore: InMemoryAggregateStore | null = null;

  setAggregateStore(store: InMemoryAggregateStore): void {
    this.aggregateStore = store;
  }

  /**
   * Requirements: NFR 3.5, NFR 3.6
   *
   * Deliberately **not** atomic, and it cannot be: there is no transaction
   * here to roll back. NFR 3.7 exists because of that — the property is
   * demonstrated against a real database, and this exists so that the paths
   * which succeed behave identically.
   */
  async materialise(
    sessionId: string,
    aggregates: Array<{
      questionId: string;
      averageScore: number;
      responseCount: number;
      improvingCount: number;
      stableCount: number;
      decliningCount: number;
    }>,
    at: Date,
  ): Promise<void> {
    if (!this.aggregateStore) {
      throw new Error('InMemorySessionRepository.materialise needs setAggregateStore first');
    }

    await this.aggregateStore.deleteBySessionId(sessionId);
    for (const aggregate of aggregates) {
      await this.aggregateStore.create({ sessionId, ...aggregate });
    }
    await this.update(sessionId, { materialisedAt: at });
  }

  private sessions: Map<string, HealthCheckSession> = new Map();
  private nextId = 1;

  async create(data: {
    teamId: string;
    status: string;
    actualOpenAt?: Date;
    scheduledOpenAt?: Date;
    scheduledCloseAt?: Date;
  }): Promise<HealthCheckSession> {
    // The caller’s clock where it has one. Inventing a second time here is how
    // a service with an injected clock ended up writing rows dated today
    const now = data.actualOpenAt ?? new Date();
    const session: HealthCheckSession = {
      id: `session-${this.nextId++}`,
      teamId: data.teamId,
      status: data.status,
      scheduledOpenAt: data.scheduledOpenAt ?? null,
      scheduledCloseAt: data.scheduledCloseAt ?? null,
      actualOpenAt: now,
      actualCloseAt: null,
      materialisedAt: null,
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
    // Matches the interface. These were narrower than the contract they
    // implement, which TypeScript permits for methods and which meant
    // `materialisedAt` was accepted at runtime while being undeclared here.
    data: Partial<Pick<HealthCheckSession, 'status' | 'actualCloseAt' | 'materialisedAt'>>,
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
