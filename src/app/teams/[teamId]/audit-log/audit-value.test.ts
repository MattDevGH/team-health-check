/**
 * Turning an audit value into something a person can read.
 *
 * Requirements: 18.2, 18.4
 *
 * Raised by Matt on 2026-09-15, after the rest of the entry had been made
 * readable: the `after` state of a schedule change still rendered as
 *
 *   {"cadence":"weekly","openDay":1,"openTime":"15:30","closeDay":1,…}
 *
 * A reader has to know that 1 means Monday. Everything else on the card reads
 * like English and this did not, which is what made it look out of place.
 *
 * The rule throughout: **never lose information**. Anything this cannot
 * confidently improve is shown exactly as it was stored, because an audit log
 * that quietly drops a field it did not recognise is worse than an ugly one.
 */

import { describe, expect, it } from 'vitest';

import { describeAuditValue, describeChangeType } from './audit-value';

const SCHEDULE =
  '{"cadence":"weekly","openDay":1,"openTime":"15:30","closeDay":1,"closeTime":"15:54","timezone":"Europe/London"}';

/** The fields as `label: value`, for readable assertions. */
function lines(value: string): string[] {
  const described = describeAuditValue(value);
  return described.kind === 'fields'
    ? described.fields.map(field => `${field.label}: ${field.value}`)
    : [described.text];
}

describe('describeAuditValue', () => {
  it('leaves a plain value alone', () => {
    // "attributed" → "anonymous" already reads perfectly well
    expect(describeAuditValue('anonymous')).toEqual({ kind: 'text', text: 'anonymous' });
  });

  it('names the day a check opens rather than numbering it', () => {
    expect(lines(SCHEDULE)).toContain('Opens: Monday at 15:30');
  });

  it('names the day a check closes', () => {
    expect(lines(SCHEDULE)).toContain('Closes: Monday at 15:54');
  });

  it('counts Sunday as zero, the way the settings page does', () => {
    /*
     * The numbering is JavaScript's, and the settings page offers exactly this
     * list. Getting it wrong here would put a confident wrong day on a record
     * whose purpose is being trusted months later.
     */
    const sunday = '{"openDay":0,"openTime":"09:00","closeDay":6,"closeTime":"17:00"}';

    expect(lines(sunday)).toContain('Opens: Sunday at 09:00');
    expect(lines(sunday)).toContain('Closes: Saturday at 17:00');
  });

  it('says the cadence in words', () => {
    expect(lines(SCHEDULE)).toContain('Cadence: Weekly');
  });

  it('says micro-pulse as a reader would write it', () => {
    expect(lines('{"cadence":"micro_pulse"}')).toContain('Cadence: Micro-pulse');
  });

  it('labels the time zone without the variable name', () => {
    expect(lines(SCHEDULE)).toContain('Time zone: Europe/London');
  });

  it('shows the whole schedule and nothing else', () => {
    // Every stored field is accounted for: a formatter that silently drops one
    // is an audit log that lies by omission
    expect(lines(SCHEDULE)).toEqual([
      'Opens: Monday at 15:30',
      'Closes: Monday at 15:54',
      'Cadence: Weekly',
      'Time zone: Europe/London',
    ]);
  });

  it('keeps a day it cannot name rather than inventing one', () => {
    // Out-of-range data should look wrong, not plausible
    expect(lines('{"openDay":9,"openTime":"09:00"}')).toContain('Opens: Day 9 at 09:00');
  });

  it('shows an open day with no time as the day alone', () => {
    expect(lines('{"openDay":2}')).toContain('Opens: Tuesday');
  });

  it('turns an unfamiliar object into labelled fields rather than a blob', () => {
    /*
     * Other change types store JSON too — a member summary, for one. They get
     * the same treatment without anyone having to enumerate them: the key
     * becomes a label and the value is shown as it is.
     */
    expect(lines('{"memberName":"Alice","role":"delivery_manager"}')).toEqual([
      'Member name: Alice',
      'Role: delivery_manager',
    ]);
  });

  it('shows a value it cannot parse exactly as it was stored', () => {
    // Never lose information: a half-written record still has to be readable
    expect(describeAuditValue('{"broken":')).toEqual({ kind: 'text', text: '{"broken":' });
  });

  it('treats a JSON array as text, since it has no field names to label', () => {
    expect(describeAuditValue('[1,2,3]')).toEqual({ kind: 'text', text: '[1,2,3]' });
  });

  it('renders a nested object as its JSON rather than as [object Object]', () => {
    expect(lines('{"team":{"id":"t1"}}')).toEqual(['Team: {"id":"t1"}']);
  });

  it('shows an empty object as the text it was stored as', () => {
    // There are no fields to label, and "no fields" would be an invention
    expect(describeAuditValue('{}')).toEqual({ kind: 'text', text: '{}' });
  });

  it('shows a boolean as yes or no', () => {
    expect(lines('{"remindersEnabled":true}')).toEqual(['Reminders enabled: Yes']);
  });

  it('shows null inside an object as the absence it is', () => {
    expect(lines('{"description":null}')).toEqual(['Description: None']);
  });
});

/**
 * The kind of change, as a person reads it.
 *
 * Requirement 18's user story settles what this screen is for: "As a delivery
 * manager, I want a record of significant team setting changes, so that I can
 * understand when and why configuration decisions were made." That is a person
 * reading their own team's history, not an engineer reading a system log — so
 * `schedule_change` is a variable name where a sentence belongs, exactly as the
 * JSON beneath it was.
 *
 * The stored identifier does not disappear: it stays on the element as
 * `data-change-type`, so anyone correlating this entry with a system record can
 * still find it without a manager having to read it.
 */
describe('describeChangeType', () => {
  it('says what happened, in words', () => {
    expect(describeChangeType('schedule_change')).toBe('Schedule changed');
  });

  it('names the other changes a manager makes', () => {
    expect(describeChangeType('privacy_mode_changed')).toBe('Privacy mode changed');
    expect(describeChangeType('member_added')).toBe('Member added');
    expect(describeChangeType('member_removed')).toBe('Member removed');
  });

  it('is specific about which window a delivery window is', () => {
    // "Delivery window changed" could be the health check's; it is Slack's
    expect(describeChangeType('delivery_window_change')).toBe('Slack delivery window changed');
  });

  it('reads an unfamiliar type rather than hiding it', () => {
    /*
     * A change type nobody has named yet is still a record of something that
     * happened. Turning it into a sentence beats both showing the raw token and
     * showing nothing — and a new one appearing in the log is how you find out
     * it was added.
     */
    expect(describeChangeType('slack_channel_renamed')).toBe('Slack channel renamed');
  });

  it('leaves an already-readable type alone', () => {
    expect(describeChangeType('Team created')).toBe('Team created');
  });

  it('never returns an empty label', () => {
    // An entry with no type is a broken record, and a blank heading hides it
    expect(describeChangeType('')).toBe('Change');
  });
});
