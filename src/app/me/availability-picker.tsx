/**
 * Availability (mark away) date range picker.
 * Requirements: 12.1
 *
 * Allows marking a date range as away via POST /api/me/availability.
 */

'use client';

import { useState } from 'react';

export function AvailabilityPicker() {
  const [awayFrom, setAwayFrom] = useState('');
  const [awayUntil, setAwayUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!awayFrom || !awayUntil || saving) return;
    setSaving(true);
    setSuccess(false);
    try {
      const res = await fetch('/api/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awayFrom, awayUntil }),
      });
      if (res.ok) {
        setSuccess(true);
        setAwayFrom('');
        setAwayUntil('');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Availability</h2>
      <div className="space-y-2">
        <div>
          <label htmlFor="away-from" className="block text-xs text-gray-500">
            Away from
          </label>
          <input
            id="away-from"
            type="date"
            value={awayFrom}
            onChange={(e) => setAwayFrom(e.target.value)}
            className="mt-1 block w-full rounded border-gray-300 text-sm"
          />
        </div>
        <div>
          <label htmlFor="away-until" className="block text-xs text-gray-500">
            Away until
          </label>
          <input
            id="away-until"
            type="date"
            value={awayUntil}
            onChange={(e) => setAwayUntil(e.target.value)}
            className="mt-1 block w-full rounded border-gray-300 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!awayFrom || !awayUntil || saving}
          className="w-full mt-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          Mark Away
        </button>
        {success && (
          <p className="text-xs text-green-600 mt-1">Away period saved</p>
        )}
      </div>
    </section>
  );
}
