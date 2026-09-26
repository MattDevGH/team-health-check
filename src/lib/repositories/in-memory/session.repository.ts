/**
 * In-memory SessionRepository fake for unit testing.
 * Requirements: 3.2
 */

import type { HealthCheckSession } from '../entities';
import type { OpenCycleParams, SessionRepository } from '../types';

/** What the fake needs in order to issue links alongside a session. */
export interface InMemoryLinkStore {
  create(data: {
    token: string;
    memberId: string;
    sessionId: string;
    expiresAt: Date;
  }): Promise<unknown>;
}

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

  /** Set by `createInMemoryRepositories`; opening a cycle issues links too. */
  private linkStore: InMemoryLinkStore | null = null;

  setLinkStore(store: InMemoryLinkStore): void {
    this.linkStore = store;
  }

  /**
   * Requirements: NFR 3.5, NFR 3.6; 6.1
   *
   * Opens a cycle, without the transaction: closes the session this one replaces, creates the new one,
   * and issues a Session_Link for every member — as one outcome.
   *
   * Not atomic here — there is nothing to roll back. The property is proved
   * against a real database in `atomic-writes.test.ts` (NFR 3.7); this exists
   * so the paths that succeed behave the same.
   *
   * These were three steps. A failure after the session was created left a
   * check nobody could answer, which is what happened in production on
   * 2026-09-14 and why `reaching-your-health-check` exists; a failure part-way
   * through the links left some of the team able to reach it and the rest not.
   * Closing the previous session belongs in the same transaction because a
   * team left with no open check at all would be worse than the failure.
   */
  async openCycle(params: OpenCycleParams): Promise<HealthCheckSession> {
    if (!this.linkStore) {
      throw new Error('InMemorySessionRepository.openCycle needs setLinkStore first');
    }

    if (params.closeExisting) {
      await this.update(params.closeExisting.id, {
        status: 'closed',
        actualCloseAt: params.closeExisting.closedAt,
      });
    }

    const created = await this.create(params.session);

    for (const link of params.links) {
      await this.linkStore.create({ ...link, sessionId: created.id });
    }

    return created;
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
