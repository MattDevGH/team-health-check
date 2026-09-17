/**
 * Whether a member wants a health check prompt by email.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.3, 4.4
 * Properties: 6, 7
 *
 * Slack is the intended primary route, and a member who gets both is being
 * told twice. But a member with no Slack at all must hear something, or this
 * milestone added a channel nobody receives.
 *
 * So the default is **derived, not stored**. A stored default would have to be
 * chosen when the row is created — before anybody knows whether Slack will be
 * linked — and would then be wrong for every member who links it afterwards,
 * or unlinks it later.
 *
 * Deliberately separate from `remindersEnabled`, which decides *which*
 * notifications are sent. This decides *how* they arrive.
 */

export interface EmailPromptChoice {
  /** What the member chose, or null if they have not. */
  preference: boolean | null;
  hasSlackLink: boolean;
}

export function wantsEmailPrompts({ preference, hasSlackLink }: EmailPromptChoice): boolean {
  // An explicit choice wins over everything, in both directions. Anything else
  // is a default wearing a switch
  if (preference !== null) return preference;

  /*
   * Unset. Somebody who can be reached in Slack is, and nobody else is left
   * with no channel at all — which is the one outcome a default must never
   * produce.
   */
  return !hasSlackLink;
}
