/** Requirement 7.9: Pending genesis for new team creation */
import type { PendingGenesis } from '../entities';
import type { PendingGenesisRepository } from '../types';

export class InMemoryPendingGenesisRepository implements PendingGenesisRepository {
  private store = new Map<string, PendingGenesis>();

  async create(data: { token: string; email: string; expiresAt: Date }): Promise<PendingGenesis> {
    const genesis: PendingGenesis = {
      id: crypto.randomUUID(),
      token: data.token,
      email: data.email,
      used: false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.store.set(genesis.id, genesis);
    return genesis;
  }

  async findByToken(token: string): Promise<PendingGenesis | null> {
    return [...this.store.values()].find(g => g.token === token) ?? null;
  }

  /** Atomic CAS: succeeds only if not used AND not expired */
  async claimToken(token: string): Promise<PendingGenesis | null> {
    const genesis = [...this.store.values()].find(g => g.token === token);
    if (!genesis) return null;
    if (genesis.used) return null;
    if (genesis.expiresAt < new Date()) return null;
    genesis.used = true;
    return genesis;
  }
}
