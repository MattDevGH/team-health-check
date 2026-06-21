/** Requirement 12.1: Team member availability */
import type { Availability } from '../entities';
import type { AvailabilityRepository } from '../types';
import { NotFoundError } from '../../errors';

export class InMemoryAvailabilityRepository implements AvailabilityRepository {
  private store = new Map<string, Availability>();

  async create(data: { memberId: string; awayFrom: Date; awayUntil: Date }): Promise<Availability> {
    const availability: Availability = {
      id: crypto.randomUUID(),
      memberId: data.memberId,
      awayFrom: data.awayFrom,
      awayUntil: data.awayUntil,
      createdAt: new Date(),
    };
    this.store.set(availability.id, availability);
    return availability;
  }

  async findByMemberId(memberId: string): Promise<Availability[]> {
    return [...this.store.values()].filter(a => a.memberId === memberId);
  }

  async findActiveByMemberIdAndDate(memberId: string, date: Date): Promise<Availability | null> {
    return [...this.store.values()].find(
      a => a.memberId === memberId && a.awayFrom <= date && a.awayUntil >= date
    ) ?? null;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new NotFoundError(`Availability not found: ${id}`);
    }
    this.store.delete(id);
  }
}
