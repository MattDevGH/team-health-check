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

  it('tells the four ways a Slack account binding changes apart', () => {
    /*
     * Requirements: Slack Sign In 2.3, 3.6, NFR 2.1
     *
     * Who linked an account and on what basis are different questions, and the
     * whole reason there are separate change types. A manager reading their
     * own team's history should be able to see that one of these happened
     * without a human deciding it.
     *
     * `slack_binding_matched` had no label until 2026-09-17: phase 2 named its
     * two types and phase 3 added a third without one, so the entry read
     * "Slack binding matched" — a variable name with the underscores taken
     * out, which is the exact defect these labels exist to remove. Found by
     * looking at what a real audit log was about to show.
     */
    expect(describeChangeType('slack_binding_asserted')).toMatch(/delivery manager/i);
    expect(describeChangeType('slack_binding_matched')).toMatch(/automatically/i);
    expect(describeChangeType('slack_binding_self_linked')).toMatch(/by the member/i);
    expect(describeChangeType('slack_binding_removed')).toMatch(/unlinked/i);

    const labels = [
      describeChangeType('slack_binding_asserted'),
      describeChangeType('slack_binding_matched'),
      describeChangeType('slack_binding_self_linked'),
      describeChangeType('slack_binding_removed'),
    ];
    expect(new Set(labels).size).toBe(4);
  });

  it('never shows a manager a word that only means something inside the code', () => {
    /*
     * The narrower rule, and the true one.
     *
     * A first version of this test demanded an explicit label for every change
     * type the application writes — and failed on `team_created`, because
     * "Team created" is a perfectly good sentence and the fallback produces it.
     * That test encoded a preference as a project rule; the codebase
     * deliberately lets the fallback handle types that already read well.
     *
     * What actually went wrong is narrower: `slack_binding_matched` fell
     * through to "Slack binding matched", and *binding* is a word from this
     * repository rather than from a delivery manager's vocabulary. So that is
     * what is banned.
     */
    const written = [
      'team_created',
      'schedule_change',
      'delivery_window_change',
      'name_change',
      'data_deletion',
      'privacy_mode_changed',
      'member_added',
      'member_removed',
      'role_assigned',
      'role_removed',
      'role_replaced',
      'team_archived',
      'slack_binding_asserted',
      'slack_binding_matched',
      'slack_binding_self_linked',
      'slack_binding_removed',
    ];
    const jargon = /\b(binding|asserted|materialis|tick|payload|repo)\b/i;

    for (const changeType of written) {
      expect(describeChangeType(changeType), `${changeType} still reads as code`).not.toMatch(
        jargon,
      );
    }
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
