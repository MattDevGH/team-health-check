/**
 * Timezone-aware local day/time extraction shared by scheduling and delivery logic.
 *
 * Session open/close matching and Slack delivery windows are both configured as
 * a day-of-week plus an `HH:MM` wall-clock time in the team's IANA timezone, so
 * both compare against the same derived values.
 *
 * Requirements: 3.1, 5.1
 */

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
