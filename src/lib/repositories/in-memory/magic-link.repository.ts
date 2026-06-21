/** Requirement 7.2: Magic link single-use access */
import type { MagicLink } from '../entities';
import type { MagicLinkRepository } from '../types';

export class InMemoryMagicLinkRepository implements MagicLinkRepository {
  private store = new Map<string, MagicLink>();

  async create(data: { token: string; memberId: string; expiresAt: Date }): Promise<MagicLink> {
    const link: MagicLink = {
      id: crypto.randomUUID(),
      token: data.token,
      memberId: data.memberId,
      used: false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.store.set(link.id, link);
    return link;
  }

  async findByToken(token: string): Promise<MagicLink | null> {
    return [...this.store.values()].find(l => l.token === token) ?? null;
  }

  /** Atomic CAS: succeeds only if not used AND not expired */
  async claimToken(token: string): Promise<MagicLink | null> {
    const link = [...this.store.values()].find(l => l.token === token);
    if (!link) return null;
    if (link.used) return null;
    if (link.expiresAt < new Date()) return null;
    link.used = true;
    return link;
  }
}
