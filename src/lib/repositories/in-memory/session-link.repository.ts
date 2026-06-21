/** Requirement 6.1: Session link generation */
import type { SessionLink } from '../entities';
import type { SessionLinkRepository } from '../types';

export class InMemorySessionLinkRepository implements SessionLinkRepository {
  private store = new Map<string, SessionLink>();

  async create(data: { token: string; memberId: string; sessionId: string; expiresAt: Date }): Promise<SessionLink> {
    const link: SessionLink = {
      id: crypto.randomUUID(),
      token: data.token,
      memberId: data.memberId,
      sessionId: data.sessionId,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.store.set(link.id, link);
    return link;
  }

  async findByToken(token: string): Promise<SessionLink | null> {
    return [...this.store.values()].find(l => l.token === token) ?? null;
  }

  async findByMemberAndSession(memberId: string, sessionId: string): Promise<SessionLink | null> {
    return [...this.store.values()].find(
      l => l.memberId === memberId && l.sessionId === sessionId
    ) ?? null;
  }
}
