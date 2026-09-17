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
