/** Requirements 7.1, 7.2, 7.3: Slack identity link persistence */
import type { SlackIdentityLink } from '../entities';
import type { SlackIdentityLinkRepository } from '../types';

export class InMemorySlackIdentityLinkRepository implements SlackIdentityLinkRepository {
  private store = new Map<string, SlackIdentityLink>();

  async create(data: { memberId: string; slackUserId: string }): Promise<SlackIdentityLink> {
    const link: SlackIdentityLink = {
      id: crypto.randomUUID(),
      memberId: data.memberId,
      slackUserId: data.slackUserId,
      createdAt: new Date(),
    };
    this.store.set(link.id, link);
    return link;
  }

  async findByMemberId(memberId: string): Promise<SlackIdentityLink | null> {
    return [...this.store.values()].find(l => l.memberId === memberId) ?? null;
  }

  async findBySlackUserId(slackUserId: string): Promise<SlackIdentityLink | null> {
    return [...this.store.values()].find(l => l.slackUserId === slackUserId) ?? null;
  }

  async upsertByMemberId(memberId: string, slackUserId: string): Promise<SlackIdentityLink> {
    const existing = await this.findByMemberId(memberId);
    if (existing) {
      existing.slackUserId = slackUserId;
      return existing;
    }
    return this.create({ memberId, slackUserId });
  }

  async delete(memberId: string): Promise<void> {
    for (const [id, link] of this.store) {
      if (link.memberId === memberId) {
        this.store.delete(id);
        return;
      }
    }
  }
}
