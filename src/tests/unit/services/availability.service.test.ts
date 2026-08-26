/**
 * Unit tests for availability.service.ts
 * Tests marking members away, removing away, and checking availability.
 * Validates: Requirements 12.1, 12.2, 12.7
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAvailabilityService } from '@/lib/services/availability.service';

describe('AvailabilityService', () => {
  let repos: Repositories;
  let availabilityService: ReturnType<typeof createAvailabilityService>;
  let memberId: string;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    availabilityService = createAvailabilityService({
      availabilityRepo: repos.availability,
    });

    // Create a team and member for testing
    const team = await repos.team.create({ name: 'Test Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'alice@example.com' });
    memberId = member.id;
  });

  describe('markAway', () => {
    it('should store availability record with correct dates', async () => {
      const awayFrom = new Date('2024-07-01T00:00:00Z');
      const awayUntil = new Date('2024-07-07T23:59:59Z');

      const availability = await availabilityService.markAway(memberId, awayFrom, awayUntil);

      expect(availability).toBeDefined();
      expect(availability.id).toBeDefined();
      expect(availability.memberId).toBe(memberId);
      expect(availability.awayFrom).toEqual(awayFrom);
      expect(availability.awayUntil).toEqual(awayUntil);
    });
  });

  describe('isAway', () => {
    it('should return true during away period', async () => {
      const awayFrom = new Date('2024-07-01T00:00:00Z');
      const awayUntil = new Date('2024-07-07T23:59:59Z');
      await availabilityService.markAway(memberId, awayFrom, awayUntil);

      const duringAway = new Date('2024-07-04T12:00:00Z');
      const result = await availabilityService.isAway(memberId, duringAway);

      expect(result).toBe(true);
    });

    it('should return false outside away period', async () => {
      const awayFrom = new Date('2024-07-01T00:00:00Z');
      const awayUntil = new Date('2024-07-07T23:59:59Z');
      await availabilityService.markAway(memberId, awayFrom, awayUntil);

      const outsideAway = new Date('2024-07-10T12:00:00Z');
      const result = await availabilityService.isAway(memberId, outsideAway);

      expect(result).toBe(false);
    });

    it('should return false when no away period is set', async () => {
      const date = new Date('2024-07-04T12:00:00Z');
      const result = await availabilityService.isAway(memberId, date);

      expect(result).toBe(false);
    });
  });

  describe('removeAway', () => {
    it('should remove the availability record', async () => {
      const awayFrom = new Date('2024-07-01T00:00:00Z');
      const awayUntil = new Date('2024-07-07T23:59:59Z');
      const availability = await availabilityService.markAway(memberId, awayFrom, awayUntil);

      await availabilityService.removeAway(availability.id);

      const records = await availabilityService.getAvailability(memberId);
      expect(records).toHaveLength(0);
    });

    it('should cause isAway to return false after removal', async () => {
      const awayFrom = new Date('2024-07-01T00:00:00Z');
      const awayUntil = new Date('2024-07-07T23:59:59Z');
      const availability = await availabilityService.markAway(memberId, awayFrom, awayUntil);

      // Confirm member is away before removal
      const duringAway = new Date('2024-07-04T12:00:00Z');
      expect(await availabilityService.isAway(memberId, duringAway)).toBe(true);

      // Remove away and confirm re-inclusion
      await availabilityService.removeAway(availability.id);
      expect(await availabilityService.isAway(memberId, duringAway)).toBe(false);
    });
  });

  describe('getAvailability', () => {
    it('should return all availability records for a member', async () => {
      const away1 = await availabilityService.markAway(
        memberId,
        new Date('2024-07-01T00:00:00Z'),
        new Date('2024-07-07T23:59:59Z')
      );
      const away2 = await availabilityService.markAway(
        memberId,
        new Date('2024-08-01T00:00:00Z'),
        new Date('2024-08-05T23:59:59Z')
      );

      const records = await availabilityService.getAvailability(memberId);
      expect(records).toHaveLength(2);
      expect(records.map(r => r.id)).toContain(away1.id);
      expect(records.map(r => r.id)).toContain(away2.id);
    });

    it('should return empty array when no availability records exist', async () => {
      const records = await availabilityService.getAvailability(memberId);
      expect(records).toHaveLength(0);
    });
  });
});
