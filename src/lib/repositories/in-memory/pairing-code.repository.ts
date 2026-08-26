/** Requirement 2.3: Slack pairing codes */
import type { PairingCode } from '../entities';
import type { PairingCodeRepository } from '../types';
import { NotFoundError } from '../../errors';

export class InMemoryPairingCodeRepository implements PairingCodeRepository {
  private store = new Map<string, PairingCode>();

  async create(data: { code: string; slackUserId: string; expiresAt: Date }): Promise<PairingCode> {
    const pairingCode: PairingCode = {
      id: crypto.randomUUID(),
      code: data.code,
      slackUserId: data.slackUserId,
      used: false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.store.set(pairingCode.id, pairingCode);
    return pairingCode;
  }

  async findByCode(code: string): Promise<PairingCode | null> {
    return [...this.store.values()].find(p => p.code === code) ?? null;
  }

  async markUsed(id: string): Promise<void> {
    const entry = this.store.get(id);
    if (!entry) {
      throw new NotFoundError(`PairingCode not found: ${id}`);
    }
    entry.used = true;
  }
}
