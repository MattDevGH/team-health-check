/**
 * Availability: what you have set, and how to change it.
 * Requirements: 12.1, Explaining Itself 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, NFR 1.1
 *
 * This took two dates, said "Away period saved" and forgot them. The service
 * has had `getAvailability` since availability was built and no route ever
 * called it, so a member who changed their plans had nowhere to go — the one
 * page that could have shown their away period never asked for it.
 *
 * Being away gates notifications and nothing else: every availability check in
 * `notification.service.ts` sits in front of a send, and no response path
 * consults it at all. So a member who marks themselves away has not withdrawn
 * from the check — they can still answer one that is open — and the difference
 * between "I will not be asked" and "I cannot take part" is worth a sentence.
 */

'use client';

import { useEffect, useState } from 'react';

const EXPLANATION_ID = 'availability-explanation';

/** As `GET /api/me/availability` sends it: dates cross JSON as strings. */
interface AwayPeriod {
  id: string;
  awayFrom: string;
  awayUntil: string;
}

/**
 * The locale is pinned, as everywhere else that shows a date here. The
 * timezone is still the reader's, which is right for somebody reading their
 * own away period.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unrecorded date';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AvailabilityPicker() {
  const [awayFrom, setAwayFrom] = useState('');
  const [awayUntil, setAwayUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [periods, setPeriods] = useState<AwayPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Bumped after a change rather than calling a loader directly, which keeps
   * the fetch inside the effect — the same shape the profile page uses, and
   * the one `react-hooks/set-state-in-effect` accepts.
   */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriods() {
      try {
        const res = await fetch('/api/me/availability');
        const loaded = res.ok ? ((await res.json()) as AwayPeriod[]) : [];
        if (!cancelled) setPeriods(loaded);
      } catch {
        if (!cancelled) setPeriods([]);
      }
    }

    loadPeriods();
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function handleSubmit() {
    if (!awayFrom || !awayUntil || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awayFrom, awayUntil }),
      });
      if (res.ok) {
        setAwayFrom('');
        setAwayUntil('');
        // Shown, not merely announced: "saved" was all a member used to get,
        // with no way to check it was the period they meant
        setVersion(v => v + 1);
      } else {
        setError('That away period could not be saved.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    setError(null);
    const res = await fetch('/api/me/availability', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      // The id, so the member cancels the period they are looking at rather
      // than whichever one the server would have picked
      body: JSON.stringify({ availabilityId: id }),
    });

    if (res.ok) {
      setVersion(v => v + 1);
      return;
    }

    // A failure that looks like a success leaves somebody expecting silence
    // they will not get
    setError('That away period could not be cancelled.');
  }

  return (
    <section className="bg-white rounded-lg shadow p-4" aria-label="Availability">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Availability</h2>
      <p id={EXPLANATION_ID} className="mb-2 text-xs text-gray-600">
        While you are away you will not be prompted or reminded about a health check. A check
        that is already open stays open — you can still answer it if you want to.
      </p>

      {periods !== null && (
        <div className="mb-3">
          {periods.length === 0 ? (
            <p className="text-sm text-gray-600">You have not marked yourself away.</p>
          ) : (
            <ul className="space-y-2">
              {periods.map(period => (
                <li key={period.id} className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-800">
                    You are away from {formatDate(period.awayFrom)} until{' '}
                    {formatDate(period.awayUntil)}.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCancel(period.id)}
                    className="shrink-0 text-sm text-blue-700 underline"
                  >
                    Cancel away period
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div
        className="space-y-2"
        role="group"
        aria-label="Mark away"
        aria-describedby={EXPLANATION_ID}
      >
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
      </div>
    </section>
  );
}
