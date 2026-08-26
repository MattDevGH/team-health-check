/** Requirement 8.1: Session aggregates for trend visualisation */
import type { SessionAggregate } from '../entities';
import type { SessionAggregateRepository } from '../types';

export class InMemorySessionAggregateRepository implements SessionAggregateRepository {
  private store = new Map<string, SessionAggregate>();
  private sessionToTeam = new Map<string, string>();

  /** Register a session-to-team mapping for findByTeamId lookups */
  registerSessionTeam(sessionId: string, teamId: string): void {
    this.sessionToTeam.set(sessionId, teamId);
  }

  async create(data: {
    sessionId: string;
    questionId: string;
    averageScore: number;
    responseCount: number;
    improvingCount: number;
    stableCount: number;
    decliningCount: number;
  }): Promise<SessionAggregate> {
    const aggregate: SessionAggregate = {
      id: crypto.randomUUID(),
      sessionId: data.sessionId,
      questionId: data.questionId,
      averageScore: data.averageScore,
      responseCount: data.responseCount,
      improvingCount: data.improvingCount,
      stableCount: data.stableCount,
      decliningCount: data.decliningCount,
      materialisedAt: new Date(),
    };
    this.store.set(aggregate.id, aggregate);
    return aggregate;
  }

  async findBySessionId(sessionId: string): Promise<SessionAggregate[]> {
    return [...this.store.values()].filter(a => a.sessionId === sessionId);
  }

  async findByTeamId(teamId: string): Promise<SessionAggregate[]> {
    const teamSessionIds = [...this.sessionToTeam.entries()]
      .filter(([, tId]) => tId === teamId)
      .map(([sId]) => sId);
    return [...this.store.values()].filter(a => teamSessionIds.includes(a.sessionId));
  }
}
