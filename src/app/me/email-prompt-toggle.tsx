/**
 * Whether health check prompts arrive by email.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.2, 4.4, 4.5, NFR 3.1
 * Properties: 6, 7
 *
 * Two things this control has to get right, both learned here the expensive
 * way.
 *
 * It must say that **signing in is not affected**. Access links arrive by
 * email, so a member who reads "email notifications" as "stop emailing me" and
 * turns it off would expect to be locked out — and the one next to it,
 * Reminders, spent a milestone governing two of four messages while saying so
 * nowhere.
 *
 * And it must show the **effective** state rather than the stored one. Null
 * means the member has not chosen and the answer is derived from their Slack
 * link, so a switch rendered off for somebody who is in fact being emailed
 * would be a lie told by a perfectly accessible control. When it is following
 * that default it says so, because "off because you said so" and "off because
 * Slack can reach you" behave differently the moment Slack is unlinked.
 */

'use client';

import { useState } from 'react';

import { wantsEmailPrompts } from '@/lib/services/email-prompt-preference';

interface EmailPromptToggleProps {
  /** The stored choice: null when the member has not made one. */
  preference: boolean | null;
  hasSlackLink: boolean;
  onChange: (preference: boolean) => void;
}

const EXPLANATION_ID = 'email-prompt-toggle-explanation';

/** Why the switch is where it is, when nobody has chosen. */
function describeDefault(hasSlackLink: boolean): string {
  return hasSlackLink
    ? 'You have not chosen, so this is off because Slack can already reach you. Unlink Slack and it turns itself on.'
    : 'You have not chosen, so this is on because email is the only way to tell you a check has opened.';
}

export function EmailPromptToggle({
  preference,
  hasSlackLink,
  onChange,
}: EmailPromptToggleProps) {
  const [stored, setStored] = useState<boolean | null>(preference);
  const [saving, setSaving] = useState(false);

  const checked = wantsEmailPrompts({ preference: stored, hasSlackLink });

  async function handleToggle() {
    if (saving) return;
    /*
     * Touching the control is choosing, so what goes to the server is always a
     * boolean. Sending null would put the member back on the default, which is
     * the one thing the click cannot have meant.
     */
    const chosen = !checked;
    setSaving(true);
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // This field alone. Two switches writing to one endpoint is how one
        // quietly resets the other
        body: JSON.stringify({ emailPromptsEnabled: chosen }),
      });
      if (res.ok) {
        setStored(chosen);
        onChange(chosen);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <label htmlFor="email-prompt-toggle" className="text-sm font-semibold text-gray-700">
          Email prompts
        </label>
        <button
          id="email-prompt-toggle"
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Email prompts"
          aria-describedby={EXPLANATION_ID}
          onClick={handleToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <p id={EXPLANATION_ID} className="mt-2 text-xs text-gray-600">
        Covers the message asking for your answers when a check opens. It decides how those
        prompts reach you, not which messages are sent — that is Reminders, above. Signing in
        is never affected: your access links arrive by email whatever this says.
        {stored === null && ` ${describeDefault(hasSlackLink)}`}
      </p>
    </section>
  );
}
