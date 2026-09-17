/**
 * Whether a member wants a health check prompt by email.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.3, 4.4
 * Properties: 6, 7
 *
 * Slack is the intended primary route, and a member who gets both is being
 * told twice. But a member with no Slack at all must hear *something*, or this
 * milestone has added a channel nobody receives.
 *
 * So the default is derived rather than stored: unset means "whatever suits
 * how you are set up". A stored default would have to be chosen when the row
 * is created, before anybody knows whether Slack will be linked — and would
 * then be wrong for every member who links Slack afterwards.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { wantsEmailPrompts } from './email-prompt-preference';

describe('a member who has not chosen', () => {
  it('gets email when they have no Slack link', () => {
    /*
     * Requirement 4.3: somebody who configures nothing still hears about
     * their check. This is the team the whole milestone exists for.
     */
    expect(wantsEmailPrompts({ preference: null, hasSlackLink: false })).toBe(true);
  });

  it('does not get email when Slack is linked', () => {
    // Requirement 5.2. Slack stays the primary route, and two copies of the
    // same message is how a tool teaches people to ignore it
    expect(wantsEmailPrompts({ preference: null, hasSlackLink: true })).toBe(false);
  });

  it('starts getting email if their Slack link goes away', () => {
    /*
     * The reason the default is derived and not stored. A member who unlinks
     * Slack has not changed a preference, but they have changed which channels
     * can reach them — and a stored default chosen at sign-up could not know.
     */
    const before = wantsEmailPrompts({ preference: null, hasSlackLink: true });
    const after = wantsEmailPrompts({ preference: null, hasSlackLink: false });

    expect(before).toBe(false);
    expect(after).toBe(true);
  });
});

describe('a member who has chosen', () => {
  it('gets email when they asked for it, even with Slack linked', () => {
    expect(wantsEmailPrompts({ preference: true, hasSlackLink: true })).toBe(true);
  });

  it('gets none when they turned it off, even with no Slack link', () => {
    /*
     * Deliberately allowed, and worth being sure about: this leaves a member
     * with no prompt channel at all. They can still reach their check from the
     * application, which is what phase 1 built — and a setting that silently
     * refused to apply would be worse than one that does what it says.
     */
    expect(wantsEmailPrompts({ preference: false, hasSlackLink: false })).toBe(false);
  });

  it('overrides the default in both directions', () => {
    // Requirement 4.1. A preference that only worked one way would be a
    // default wearing a switch
    expect(wantsEmailPrompts({ preference: true, hasSlackLink: true })).not.toBe(
      wantsEmailPrompts({ preference: null, hasSlackLink: true }),
    );
    expect(wantsEmailPrompts({ preference: false, hasSlackLink: false })).not.toBe(
      wantsEmailPrompts({ preference: null, hasSlackLink: false }),
    );
  });
});

describe('the rule, over every combination', () => {
  it('follows an explicit choice whatever else is true', () => {
    /*
     * Property 6. Generated because the whole point of a preference is that
     * nothing else overrides it — and an implementation that consulted the
     * Slack link first would pass every example above where the two agree.
     */
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (preference, hasSlackLink) => {
        expect(wantsEmailPrompts({ preference, hasSlackLink })).toBe(preference);
      }),
    );
  });

  it('never leaves a member with no channel unless they asked for that', () => {
    // Property 7, the safety one: silence is only ever something somebody chose
    fc.assert(
      fc.property(fc.boolean(), hasSlackLink => {
        const silent = !hasSlackLink && !wantsEmailPrompts({ preference: null, hasSlackLink });
        expect(silent, 'an unconfigured member with no Slack would hear nothing').toBe(false);
      }),
    );
  });
});
