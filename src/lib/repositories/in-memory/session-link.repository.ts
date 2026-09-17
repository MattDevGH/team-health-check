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
  /**
   * Everything this member owns, gone with them.
   *
   * Requirements: Slack Sign In 4.4. Not part of the repository interface —
   * the Prisma removal does this inside one transaction, and this exists so
   * the fake tells the same truth. It did not, and a member removed from a
   * team kept a working Slack identity link in every test that used fakes.
   */
  removeByMemberId(memberId: string): void {
    for (const [key, value] of this.store) {
      if (value.memberId === memberId) this.store.delete(key);
    }
  }

}
