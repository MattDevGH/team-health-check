/**
 * Availability (away) management service.
 * Handles marking members as away, removing away status, and checking
 * if a member is away during a given date.
 * Away members are excluded from participation counts and prompts.
 * Requirements: 12.1, 12.2, 12.7, Explaining Itself 5.2, 5.4, 5.5
 * Property: 5 (away periods are member-scoped)
 */

import type { AvailabilityRepository } from '@/lib/repositories/types';
import type { Availability } from '@/lib/repositories/entities';

export interface AvailabilityServiceDeps {
  availabilityRepo: AvailabilityRepository;
}

export interface AvailabilityService {
  markAway(memberId: string, awayFrom: Date, awayUntil: Date): Promise<Availability>;
  /**
   * Cancel an away period the member owns.
   *
   * Takes the member id because it used to take only the period id and delete
   * whatever it named. The route passed one straight from a request body, so
   * any signed-in member could cancel any other member's away period given its
   * id — and the member who lost it would be prompted through a holiday with
   * nothing on the page to say why.
   *
   * Cancelling one that is already gone succeeds: a member who clicks twice,
   * or returns to a stale page, wants the state, not an argument about it.
   */
  removeAway(memberId: string, availabilityId: string): Promise<void>;
  isAway(memberId: string, date: Date): Promise<boolean>;
  getAvailability(memberId: string): Promise<Availability[]>;
}

/**
 * Factory function for creating the availability service.
 */
export function createAvailabilityService(deps: AvailabilityServiceDeps): AvailabilityService {
  const { availabilityRepo } = deps;

  async function markAway(memberId: string, awayFrom: Date, awayUntil: Date): Promise<Availability> {
    return availabilityRepo.create({ memberId, awayFrom, awayUntil });
  }

  async function removeAway(memberId: string, availabilityId: string): Promise<void> {
    /*
     * Read before delete, and scoped to the member. A period belonging to
     * somebody else is indistinguishable from one that never existed, which is
     * the right answer to both questions: it is not yours to cancel, and
     * saying which of the two it is would confirm that somebody else's period
     * exists.
     */
    const owned = await availabilityRepo.findByMemberId(memberId);
    if (!owned.some(period => period.id === availabilityId)) return;

    return availabilityRepo.delete(availabilityId);
  }

  async function isAway(memberId: string, date: Date): Promise<boolean> {
    const active = await availabilityRepo.findActiveByMemberIdAndDate(memberId, date);
    return active !== null;
  }

  async function getAvailability(memberId: string): Promise<Availability[]> {
    return availabilityRepo.findByMemberId(memberId);
  }

  return { markAway, removeAway, isAway, getAvailability };
}
