/**
 * Tests for timezone-aware scheduling helpers.
 *
 * Session close times are configured as a weekday plus an HH:MM wall-clock time
 * in the team's timezone, so resolving them to UTC instants must survive DST.
 *
 * Requirements: 3.1, 5.1
 */

import { describe, it, expect } from 'vitest';

import {
  getLocalDayAndTime,
  isWithinTimeWindow,
  nextOccurrenceUtc,
  previousOccurrenceUtc,
} from './local-time';

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

/**
 * The most recent occurrence at or before an instant.
 *
 * Requirements: Deployment 4.1, 4.3
 *
 * The scheduler needs to answer "which cycle are we in?" rather than "is it
 * exactly now?". `nextOccurrenceUtc` only looks forward, so there was no way to
 * ask, and the scheduler compared clock strings instead — which meant a tick one
 * minute late opened nothing at all.
 */
describe('previousOccurrenceUtc', () => {
  const MONDAY_9AM = 1;

  it('returns today’s occurrence once it has passed', () => {
    // Monday 2026-09-14, 10:00 UTC — the 09:00 occurrence is behind us
    const result = previousOccurrenceUtc(
      new Date('2026-09-14T10:00:00Z'), MONDAY_9AM, '09:00', 'UTC',
    );
    expect(result.toISOString()).toBe('2026-09-14T09:00:00.000Z');
  });

  it('returns last week’s when today’s has not arrived yet', () => {
    // Monday 08:00 — today's 09:00 is still ahead, so the current cycle began a week ago
    const result = previousOccurrenceUtc(
      new Date('2026-09-14T08:00:00Z'), MONDAY_9AM, '09:00', 'UTC',
    );
    expect(result.toISOString()).toBe('2026-09-07T09:00:00.000Z');
  });

  it('includes an occurrence falling exactly on the instant', () => {
    // The boundary the old equality check depended on must still be inside the cycle
    const result = previousOccurrenceUtc(
      new Date('2026-09-14T09:00:00Z'), MONDAY_9AM, '09:00', 'UTC',
    );
    expect(result.toISOString()).toBe('2026-09-14T09:00:00.000Z');
  });

  it('works from a day later in the week', () => {
    const result = previousOccurrenceUtc(
      new Date('2026-09-17T15:00:00Z'), MONDAY_9AM, '09:00', 'UTC',
    );
    expect(result.toISOString()).toBe('2026-09-14T09:00:00.000Z');
  });

  it('keeps local wall-clock time across a DST change', () => {
    // British Summer Time ends 2026-10-25. A 09:00 London check stays 09:00
    // local on both sides, which is 08:00Z before and 09:00Z after.
    const before = previousOccurrenceUtc(
      new Date('2026-10-20T12:00:00Z'), MONDAY_9AM, '09:00', 'Europe/London',
    );
    expect(before.toISOString()).toBe('2026-10-19T08:00:00.000Z');

    const after = previousOccurrenceUtc(
      new Date('2026-10-27T12:00:00Z'), MONDAY_9AM, '09:00', 'Europe/London',
    );
    expect(after.toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });

  it('is always at most a week behind', () => {
    // The property that makes it usable: exactly one weekly occurrence lies in
    // any seven-day window ending now
    const now = new Date('2026-09-17T15:00:00Z');
    const result = previousOccurrenceUtc(now, MONDAY_9AM, '09:00', 'UTC');
    const ageMs = now.getTime() - result.getTime();

    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });
});
