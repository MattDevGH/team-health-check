/**
 * Turning an audit value into something a person can read.
 *
 * Requirements: 18.2, 18.4
 *
 * Raised after the rest of the entry had been made readable: the `after` state
 * of a schedule change still rendered as
 *
 *   {"cadence":"weekly","openDay":1,"openTime":"15:30","closeDay":1,…}
 *
 * A reader has to know that 1 means Monday. Everything else on the card reads
 * like English and this did not, which is what made it look out of place.
 *
 * **Never lose information.** Anything this cannot confidently improve is shown
 * exactly as it was stored: an audit log that quietly drops a field it did not
 * recognise is worse than an ugly one.
 */

import { weekDayName } from '@/lib/week-days';

export interface AuditField {
  label: string;
  value: string;
}

export type AuditValueView =
  | { kind: 'text'; text: string }
  | { kind: 'fields'; fields: AuditField[] };

/** Labels for the keys worth naming properly. */
const LABELS: Record<string, string> = {
  cadence: 'Cadence',
  timezone: 'Time zone',
};

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  micro_pulse: 'Micro-pulse',
};

/** `memberName` → `Member name`, for keys nobody has named by hand. */
function humaniseKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** One stored value, as text. Objects keep their JSON rather than becoming `[object Object]`. */
function describeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * "Monday at 15:30", or whatever part of that is known.
 *
 * A day out of range keeps its number — "Day 9" — because data that is wrong
 * should look wrong rather than plausible.
 */
function describeDayAndTime(day: unknown, time: unknown): string | null {
  const dayText =
    typeof day === 'number' ? (weekDayName(day) ?? `Day ${day}`) : undefined;
  const timeText = typeof time === 'string' ? time : undefined;

  if (dayText && timeText) return `${dayText} at ${timeText}`;
  return dayText ?? timeText ?? null;
}

export function describeAuditValue(value: string): AuditValueView {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    // Not JSON, or half-written. Either way it is shown as stored.
    return { kind: 'text', text: value };
  }

  /*
   * Arrays and primitives have no field names to label, and an empty object has
   * no fields at all — reporting "no fields" would be an invention.
   */
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'text', text: value };
  }

  const record = parsed as Record<string, unknown>;
  const remaining = new Map(Object.entries(record));
  const fields: AuditField[] = [];

  /*
   * The schedule's pairs first. A day and a time are one fact to a reader and
   * two columns to a database, and "Opens: Monday at 15:30" is the sentence
   * they were looking for.
   */
  for (const [dayKey, timeKey, label] of [
    ['openDay', 'openTime', 'Opens'],
    ['closeDay', 'closeTime', 'Closes'],
  ] as const) {
    if (!remaining.has(dayKey) && !remaining.has(timeKey)) continue;

    const described = describeDayAndTime(record[dayKey], record[timeKey]);
    remaining.delete(dayKey);
    remaining.delete(timeKey);

    if (described) fields.push({ label, value: described });
  }

  for (const [key, raw] of remaining) {
    const label = LABELS[key] ?? humaniseKey(key);
    const value =
      key === 'cadence' && typeof raw === 'string'
        ? (CADENCE_LABELS[raw] ?? raw)
        : describeScalar(raw);

    fields.push({ label, value });
  }

  return fields.length > 0 ? { kind: 'fields', fields } : { kind: 'text', text: value };
}

/**
 * Names for change types where the obvious rewording would be wrong or vague.
 *
 * Everything else is handled by the general rule below, so a type added later
 * reads properly without anyone remembering to come back here.
 */
const CHANGE_TYPE_LABELS: Record<string, string> = {
  // "Delivery window changed" could be the health check's; it is Slack's
  delivery_window_change: 'Slack delivery window changed',
  schedule_change: 'Schedule changed',
  name_change: 'Team renamed',
  data_deletion: 'Data deleted',
  /*
   * Named for *how* the binding came about, because the log has to answer that
   * as well as who. Phase 3 of Slack sign-in adds one an email match creates,
   * and "Slack account linked" alone could not tell a manager's assertion from
   * the application's own.
   */
  slack_binding_asserted: 'Slack account linked by a delivery manager',
  slack_binding_removed: 'Slack account unlinked',
};

/**
 * What kind of change this was, as a person reads it.
 *
 * Requirement 18's user story settles what this screen is for: a delivery
 * manager understanding when and why configuration decisions were made. That is
 * a person reading their own team's history, so `schedule_change` is a variable
 * name where a sentence belongs — the same defect as the JSON beneath it.
 *
 * The stored identifier is not lost: the page keeps it on the element as
 * `data-change-type`, so an entry can still be correlated with a system record
 * without a manager having to read a token.
 */
export function describeChangeType(changeType: string): string {
  const trimmed = changeType.trim();

  // A record with no type is broken, and a blank heading would hide it
  if (trimmed === '') return 'Change';

  const known = CHANGE_TYPE_LABELS[trimmed];
  if (known) return known;

  const words = trimmed.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
