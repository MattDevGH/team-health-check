/**
 * Reminder enable/disable toggle component.
 * Requirements: 13.1
 *
 * Toggle switch for enabling/disabling session reminders.
 */

'use client';

import { useState } from 'react';

interface ReminderToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

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
    </section>
  );
}
