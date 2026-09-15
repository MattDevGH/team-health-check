/**
 * The days of the week, numbered as JavaScript numbers them.
 *
 * Sunday is 0, matching `Date.prototype.getDay` and `src/lib/local-time.ts`,
 * which is what the stored schedule means by `openDay: 1`.
 *
 * Shared so the settings page and the audit log cannot disagree about which day
 * a number is. They were two lists until the audit log needed one, and two
 * lists of the same thing is one list and a future defect.
 */

export interface WeekDay {
  value: number;
  label: string;
}

export const WEEK_DAYS: readonly WeekDay[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

/**
 * The day's name, or null when the number is not a day.
 *
 * Null rather than a fallback name: a record showing "Day 9" looks wrong, which
 * is what it is. A plausible-looking wrong day would be worse than an obviously
 * broken one on a screen whose purpose is being trusted months later.
 */
export function weekDayName(value: number): string | null {
  return WEEK_DAYS.find(day => day.value === value)?.label ?? null;
}
