/**
 * Schedule Section — Configure session cadence
 * Requirements: 3.1
 */

'use client';

import { useState } from 'react';

import { WEEK_DAYS } from '@/lib/week-days';

export interface ScheduleData {
  cadence: string;
  openDay: number;
  openTime: string;
  closeDay: number;
  closeTime: string;
  timezone: string;
}

interface ScheduleSectionProps {
  teamId: string;
  schedule: ScheduleData | null;
  onUpdated: (schedule: ScheduleData) => void;
}

/**
 * Shared with the audit log, which has to name the day a stored number means.
 * Two lists of the same thing is one list and a future defect.
 */
const DAYS = WEEK_DAYS;

export function ScheduleSection({ teamId, schedule, onUpdated }: ScheduleSectionProps) {
  const [openDay, setOpenDay] = useState(String(schedule?.openDay ?? 1));
  const [openTime, setOpenTime] = useState(schedule?.openTime ?? '09:00');
  const [closeDay, setCloseDay] = useState(String(schedule?.closeDay ?? 5));
  const [closeTime, setCloseTime] = useState(schedule?.closeTime ?? '17:00');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? 'Europe/London');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function changed(update: () => void) {
    update();
    setSaved(false);
  }

  async function handleSave() {
    setError('');
    setSaved(false);
    setSaving(true);

    const payload = {
      cadence: 'weekly',
      openDay: Number(openDay),
      openTime,
      closeDay: Number(closeDay),
      closeTime,
      timezone,
    };

    try {
      const response = await fetch(`/api/teams/${teamId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.errors?.[0]?.message ?? 'Failed to save schedule');
        return;
      }

      onUpdated(payload);
      setSaved(true);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="schedule-heading">
      <h2 id="schedule-heading" className="text-lg font-semibold text-gray-800 mb-3">
        Schedule
      </h2>
      <p className="mb-3 text-sm text-gray-600">
        The schedule opens and closes health checks for you, and decides when
        prompts go out. Without one, nothing happens automatically — you open
        and close each check yourself from the dashboard, which is a reasonable
        way to run this if your team&rsquo;s rhythm varies.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="open-day" className="block text-sm font-medium text-gray-700 mb-1">
            Open day
          </label>
          <select
            id="open-day"
            value={openDay}
            onChange={(event) => changed(() => setOpenDay(event.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            {DAYS.map((day) => (
              <option key={day.value} value={String(day.value)}>{day.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="open-time" className="block text-sm font-medium text-gray-700 mb-1">
            Open time
          </label>
          <input
            id="open-time"
            type="time"
            value={openTime}
            onChange={(event) => changed(() => setOpenTime(event.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label htmlFor="close-day" className="block text-sm font-medium text-gray-700 mb-1">
            Close day
          </label>
          <select
            id="close-day"
            value={closeDay}
            onChange={(event) => changed(() => setCloseDay(event.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            {DAYS.map((day) => (
              <option key={day.value} value={String(day.value)}>{day.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="close-time" className="block text-sm font-medium text-gray-700 mb-1">
            Close time
          </label>
          <input
            id="close-time"
            type="time"
            value={closeTime}
            onChange={(event) => changed(() => setCloseTime(event.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <input
            id="timezone"
            type="text"
            value={timezone}
            onChange={(event) => changed(() => setTimezone(event.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      {saved && <p className="mt-2 text-sm text-green-700" role="status">Schedule saved.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-3 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save schedule'}
      </button>
    </section>
  );
}
