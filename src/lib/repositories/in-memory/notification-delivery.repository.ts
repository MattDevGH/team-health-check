/** Requirements 13.8, 13.10: one notification per member per session per type */
import type { NotificationDeliveryRepository } from '../types';

export class InMemoryNotificationDeliveryRepository implements NotificationDeliveryRepository {
  private claimed = new Set<string>();

  private key(memberId: string, sessionId: string, type: string): string {
    return `${memberId}::${sessionId}::${type}`;
  }

  /**
   * Mirrors the Prisma implementation's unique-constraint behaviour: the first
   * caller wins, every later caller is told the slot is taken.
   */
  async claim(data: { memberId: string; sessionId: string; type: string }): Promise<boolean> {
    const key = this.key(data.memberId, data.sessionId, data.type);
    if (this.claimed.has(key)) {
      return false;
    }
    this.claimed.add(key);
    return true;
  }

  async hasDelivered(memberId: string, sessionId: string, type: string): Promise<boolean> {
    return this.claimed.has(this.key(memberId, sessionId, type));
  }
}
