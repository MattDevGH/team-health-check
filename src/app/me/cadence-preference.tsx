/**
 * Cadence Preference toggle component.
 * Requirements: 15.1, 15.2, Explaining Itself 4.1, 4.5, NFR 1.1
 *
 * Allows switching between "session" (weekly) and "micro_pulse" cadence.
 *
 * The two labels were "Weekly" and "Micro-Pulse", which is a choice with
 * nothing to choose on. What differs is how many questions arrive at once:
 * weekly sends all five, micro-pulse spreads a few over the days the check is
 * open and leaves the rest reachable. That is what the description says, tied
 * to the group with `aria-describedby` so a screen reader hears it as part of
 * the control rather than as nearby prose.
 */

'use client';

import { useState } from 'react';

interface CadencePreferenceProps {
  value: string;
  onChange: (cadence: string) => void;
}

const EXPLANATION_ID = 'cadence-preference-explanation';

const CADENCES = [
  { id: 'session', label: 'Weekly' },
  { id: 'micro_pulse', label: 'Micro-Pulse' },
] as const;

export function CadencePreference({ value, onChange }: CadencePreferenceProps) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);

  async function handleSelect(cadence: string) {
    if (cadence === selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadencePreference: cadence }),
      });
      if (res.ok) {
        setSelected(cadence);
        onChange(cadence);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Cadence Preference</h2>
      <div
        className="flex gap-2"
        role="group"
        aria-label="Cadence preference"
        aria-describedby={EXPLANATION_ID}
      >
        {CADENCES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="button"
            aria-pressed={selected === c.id}
            onClick={() => handleSelect(c.id)}
            disabled={saving}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              selected === c.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p id={EXPLANATION_ID} className="mt-2 text-xs text-gray-600">
        <strong className="font-medium">Weekly</strong> asks you all five questions at once, when
        the check opens. <strong className="font-medium">Micro-pulse</strong> asks a few each day
        instead, spread across the days the check stays open — you can still open the rest
        whenever you want to.
      </p>
    </section>
  );
}
