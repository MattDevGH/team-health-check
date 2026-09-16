/**
 * Reminder enable/disable toggle component.
 * Requirements: 13.1, Explaining Itself 4.2, 4.5, NFR 1.1
 *
 * Toggle switch for enabling/disabling session reminders.
 *
 * It was labelled "Reminders" and governed two of the four messages this
 * application sends. `sendClosingReminder` and `sendMidSessionNudge` read
 * `remindersEnabled`; `sendSlackPrompt` — the message that arrives when a
 * check opens — never has. So a member who turned this off expecting silence
 * got a message anyway and had every reason to think the setting was broken.
 *
 * Saying so is cheaper than the two alternatives: changing what the toggle
 * governs, which would mean a member could silence the only prompt that starts
 * a check, or leaving them to work it out.
 */

'use client';

import { useState } from 'react';

interface ReminderToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

const EXPLANATION_ID = 'reminder-toggle-explanation';

export function ReminderToggle({ enabled, onChange }: ReminderToggleProps) {
  const [checked, setChecked] = useState(enabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle() {
    if (saving) return;
    const newValue = !checked;
    setSaving(true);
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remindersEnabled: newValue }),
      });
      if (res.ok) {
        setChecked(newValue);
        onChange(newValue);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <label htmlFor="reminder-toggle" className="text-sm font-semibold text-gray-700">
          Reminders
        </label>
        <button
          id="reminder-toggle"
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Reminders"
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
        Covers the nudge partway through a check and the reminder when one is about to close.
        You will still be prompted in Slack when a check opens, and turning this off never
        affects the emails you use for signing in.
      </p>
    </section>
  );
}
