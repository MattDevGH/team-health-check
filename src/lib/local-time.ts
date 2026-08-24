/**
 * Timezone-aware local day/time extraction shared by scheduling and delivery logic.
 *
 * Session open/close matching and Slack delivery windows are both configured as
 * a day-of-week plus an `HH:MM` wall-clock time in the team's IANA timezone, so
 * both compare against the same derived values.
 *
 * Requirements: 3.1, 5.1
 */

import { fromZonedTime } from 'date-fns-tz';

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Extracts the day of week (0=Sunday..6=Saturday) and HH:MM time string
 * from a Date, interpreted in the given IANA timezone.
 */
export function getLocalDayAndTime(
  date: Date,
  timezone: string,
): { day: number; time: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';

  return {
    day: DAY_INDEX[weekdayStr] ?? 0,
    time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
  };
}

/** Calendar date (`YYYY-MM-DD`) of an instant, in the given timezone. */
function getLocalDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Resolves the next `HH:MM` on the given weekday, in the given timezone, to the
 * UTC instant strictly after `after`.
 *
 * Calendar arithmetic is done on date components rather than by adding 24-hour
 * spans, so a DST transition cannot skip or repeat a day. The wall-clock time is
 * then converted with `fromZonedTime`, which keeps the configured local time
 * stable across DST rather than drifting by an hour.
 *
 * @param day 0=Sunday..6=Saturday
 * @param time `HH:MM` in the team's timezone
 */
export function nextOccurrenceUtc(
  after: Date,
  day: number,
  time: string,
  timezone: string,
): Date {
  const [year, month, dayOfMonth] = getLocalDate(after, timezone).split('-').map(Number);
  let fallback: Date | null = null;

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(Date.UTC(year, month - 1, dayOfMonth + offset));
    if (candidate.getUTCDay() !== day) continue;

    const stamp = getLocalDate(candidate, 'UTC');
    const instant = fromZonedTime(`${stamp} ${time}:00`, timezone);

    if (instant.getTime() > after.getTime()) {
      return instant;
    }
    fallback = instant;
  }

  // Only reachable if every candidate landed at or before `after`; the matching
  // weekday one week on is then the next occurrence.
  return fallback ?? new Date(after.getTime());
}

/**
 * True when `time` falls inside an inclusive `HH:MM` window.
 * A window whose start is later than its end spans midnight.
 */
export function isWithinTimeWindow(time: string, start: string, end: string): boolean {
  if (start <= end) {
    return time >= start && time <= end;
  }

  return time >= start || time <= end;
}
