/**
 * Tests for timezone-aware scheduling helpers.
 *
 * Session close times are configured as a weekday plus an HH:MM wall-clock time
 * in the team's timezone, so resolving them to UTC instants must survive DST.
 *
 * Requirements: 3.1, 5.1
 */

import { describe, it, expect } from 'vitest';

import { getLocalDayAndTime, isWithinTimeWindow, nextOccurrenceUtc } from './local-time';

describe('getLocalDayAndTime', () => {
  it('reads the weekday and wall-clock time in the given timezone', () => {
    // 2026-08-24T08:30Z is Monday 09:30 in British Summer Time
    expect(getLocalDayAndTime(new Date('2026-08-24T08:30:00.000Z'), 'Europe/London')).toEqual({
      day: 1,
      time: '09:30',
    });
  });

  it('can differ in weekday from UTC', () => {
    // 23:30 Monday UTC is already Tuesday in Tokyo
    expect(getLocalDayAndTime(new Date('2026-08-24T23:30:00.000Z'), 'Asia/Tokyo')).toEqual({
      day: 2,
      time: '08:30',
    });
  });
});

describe('isWithinTimeWindow', () => {
  it('includes both boundaries', () => {
    expect(isWithinTimeWindow('09:00', '09:00', '17:00')).toBe(true);
    expect(isWithinTimeWindow('17:00', '09:00', '17:00')).toBe(true);
  });

  it('excludes times outside a normal window', () => {
    expect(isWithinTimeWindow('08:59', '09:00', '17:00')).toBe(false);
    expect(isWithinTimeWindow('17:01', '09:00', '17:00')).toBe(false);
  });

  it('treats a start later than the end as spanning midnight', () => {
    expect(isWithinTimeWindow('23:00', '22:00', '06:00')).toBe(true);
    expect(isWithinTimeWindow('05:59', '22:00', '06:00')).toBe(true);
    expect(isWithinTimeWindow('12:00', '22:00', '06:00')).toBe(false);
  });
});

describe('nextOccurrenceUtc', () => {
  it('finds the next matching weekday and time later the same week', () => {
    // Monday 2026-08-24 09:00 UTC → next Friday 17:00 in UTC
    const result = nextOccurrenceUtc(new Date('2026-08-24T09:00:00.000Z'), 5, '17:00', 'UTC');

    expect(result.toISOString()).toBe('2026-08-28T17:00:00.000Z');
  });

  it('returns later the same day when the time has not yet passed', () => {
    const result = nextOccurrenceUtc(new Date('2026-08-24T09:00:00.000Z'), 1, '17:00', 'UTC');

    expect(result.toISOString()).toBe('2026-08-24T17:00:00.000Z');
  });

  it('rolls to the following week when the time has already passed today', () => {
    const result = nextOccurrenceUtc(new Date('2026-08-24T18:00:00.000Z'), 1, '17:00', 'UTC');

    expect(result.toISOString()).toBe('2026-08-31T17:00:00.000Z');
  });

  it('resolves the wall-clock time in the team timezone, not UTC', () => {
    // 17:00 BST is 16:00 UTC
    const result = nextOccurrenceUtc(
      new Date('2026-08-24T09:00:00.000Z'),
      5,
      '17:00',
      'Europe/London',
    );

    expect(result.toISOString()).toBe('2026-08-28T16:00:00.000Z');
  });

  it('keeps the wall-clock time across a DST transition', () => {
    // British Summer Time ends 2026-10-25. A Friday 17:00 close before the
    // change is 16:00 UTC; after the change it is 17:00 UTC.
    const beforeChange = nextOccurrenceUtc(
      new Date('2026-10-19T09:00:00.000Z'),
      5,
      '17:00',
      'Europe/London',
    );
    const afterChange = nextOccurrenceUtc(
      new Date('2026-10-26T09:00:00.000Z'),
      5,
      '17:00',
      'Europe/London',
    );

    expect(beforeChange.toISOString()).toBe('2026-10-23T16:00:00.000Z');
    expect(afterChange.toISOString()).toBe('2026-10-30T17:00:00.000Z');
  });

  it('handles a timezone whose local date is ahead of UTC', () => {
    // 2026-08-24T23:30Z is Tuesday 08:30 in Tokyo, so the next Tuesday 09:00
    // local is only 30 minutes away
    const result = nextOccurrenceUtc(
      new Date('2026-08-24T23:30:00.000Z'),
      2,
      '09:00',
      'Asia/Tokyo',
    );

    expect(result.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });
});
