/**
 * Availability (away) management service.
 * Handles marking members as away, removing away status, and checking
 * if a member is away during a given date.
 * Away members are excluded from participation counts and prompts.
 * Requirements: 12.1, 12.2, 12.7
 */

import type { AvailabilityRepository } from '@/lib/repositories/types';
import type { Availability } from '@/lib/repositories/entities';

export interface AvailabilityServiceDeps {
  availabilityRepo: AvailabilityRepository;
}

export interface AvailabilityService {
  markAway(memberId: string, awayFrom: Date, awayUntil: Date): Promise<Availability>;
  removeAway(availabilityId: string): Promise<void>;
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

  async function removeAway(availabilityId: string): Promise<void> {
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
