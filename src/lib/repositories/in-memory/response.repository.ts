/**
 * In-memory ResponseRepository fake for unit testing.
 * Requirements: 10.2, 10.3
 */

import type { Response } from '../entities';
import type { ResponseRepository } from '../types';

type GetSessionTeamId = (sessionId: string) => string | null;

export class InMemoryResponseRepository implements ResponseRepository {
  private responses: Map<string, Response> = new Map();
  private compositeIndex: Map<string, string> = new Map();
  private nextId = 1;
  private getSessionTeamId: GetSessionTeamId;

  constructor(getSessionTeamId: GetSessionTeamId) {
    this.getSessionTeamId = getSessionTeamId;
  }

  async upsert(data: {
    memberId: string;
    sessionId: string;
    questionId: string;
    score: number;
    trendIndicator?: string;
  }): Promise<Response> {
    const compositeKey = `${data.memberId}:${data.sessionId}:${data.questionId}`;
    const existingId = this.compositeIndex.get(compositeKey);

    if (existingId) {
      const existing = this.responses.get(existingId)!;
      const updated: Response = {
        ...existing,
        score: data.score,
        trendIndicator: data.trendIndicator ?? null,
        updatedAt: new Date(),
      };
      this.responses.set(existingId, updated);
      return updated;
    }

    const now = new Date();
    const response: Response = {
      id: `response-${this.nextId++}`,
      memberId: data.memberId,
      sessionId: data.sessionId,
      questionId: data.questionId,
      score: data.score,
      trendIndicator: data.trendIndicator ?? null,
      submittedAt: now,
      updatedAt: now,
    };

    this.responses.set(response.id, response);
    this.compositeIndex.set(compositeKey, response.id);
    return response;
  }

  async findByMemberAndSession(
    memberId: string,
    sessionId: string,
  ): Promise<Response[]> {
    return Array.from(this.responses.values()).filter(
      r => r.memberId === memberId && r.sessionId === sessionId,
    );
  }

  async findBySession(sessionId: string): Promise<Response[]> {
    return Array.from(this.responses.values()).filter(
      r => r.sessionId === sessionId,
    );
  }

  async findRecentByTeamAndQuestion(
    teamId: string,
    questionId: string,
    count: number,
  ): Promise<Response[]> {
    const matching = Array.from(this.responses.values())
      .filter(r => {
        if (r.questionId !== questionId) return false;
        const sessionTeamId = this.getSessionTeamId(r.sessionId);
        return sessionTeamId === teamId;
      })
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

    return matching.slice(0, count);
  }

  async deleteByMemberId(memberId: string): Promise<number> {
    const toDelete: string[] = [];
    Array.from(this.responses.entries()).forEach(([id, response]) => {
      if (response.memberId === memberId) {
        toDelete.push(id);
      }
    });
    for (const id of toDelete) {
      const response = this.responses.get(id)!;
      const key = `${response.memberId}:${response.sessionId}:${response.questionId}`;
      this.compositeIndex.delete(key);
      this.responses.delete(id);
    }
    return toDelete.length;
  }

  async countBySessionAndQuestion(
    sessionId: string,
    questionId: string,
  ): Promise<number> {
    return Array.from(this.responses.values()).filter(
      r => r.sessionId === sessionId && r.questionId === questionId,
    ).length;
  }
}
