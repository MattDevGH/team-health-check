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
}
