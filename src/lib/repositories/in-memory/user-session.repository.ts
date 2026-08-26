/** Requirement 7.3: Authenticated user sessions */
import type { UserSession } from '../entities';
import type { UserSessionRepository } from '../types';

export class InMemoryUserSessionRepository implements UserSessionRepository {
  private store = new Map<string, UserSession>();

  async create(data: { memberId: string; token: string; expiresAt: Date }): Promise<UserSession> {
    const session: UserSession = {
      id: crypto.randomUUID(),
      memberId: data.memberId,
      token: data.token,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.store.set(session.id, session);
    return session;
  }

  async findByToken(token: string): Promise<UserSession | null> {
    return [...this.store.values()].find(s => s.token === token) ?? null;
  }

  async findValidByMemberId(memberId: string): Promise<UserSession | null> {
    const now = new Date();
    const active = [...this.store.values()].filter(
      session => session.memberId === memberId && session.expiresAt > now,
    );
    active.sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime());
    return active[0] ?? null;
  }

  async shortenExpiry(token: string, expiresAt: Date): Promise<UserSession | null> {
    const session = await this.findByToken(token);
    if (!session) return null;

    if (expiresAt < session.expiresAt) {
      session.expiresAt = expiresAt;
    }
    return session;
  }

  async deleteByToken(token: string): Promise<void> {
    const entry = [...this.store.entries()].find(([, session]) => session.token === token);
    if (entry) {
      this.store.delete(entry[0]);
    }
  }
}
