/**
 * Slack Delivery Window Section — Start/end time configuration
 * Requirements: 5.1
 */

'use client';

import { useState } from 'react';

interface SlackDeliverySectionProps {
  teamId: string;
  deliveryStart: string;
  deliveryEnd: string;
  onUpdated: (start: string, end: string) => void;
}

export function SlackDeliverySection({
  teamId,
  deliveryStart,
  deliveryEnd,
  onUpdated,
}: SlackDeliverySectionProps) {
  const [start, setStart] = useState(deliveryStart);
  const [end, setEnd] = useState(deliveryEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackDeliveryStart: start, slackDeliveryEnd: end }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.errors?.[0]?.message ?? 'Failed to save');
        setSaving(false);
        return;
      }

      onUpdated(start, end);
    } catch {
      setError('Network error');
    }

    setSaving(false);
  }

  return (
    <section aria-labelledby="slack-delivery-heading">
      <h2 id="slack-delivery-heading" className="text-lg font-semibold text-gray-800 mb-3">
        Slack Delivery Window
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="delivery-start" className="block text-sm font-medium text-gray-700 mb-1">
            Delivery start
          </label>
          <input
            id="delivery-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label htmlFor="delivery-end" className="block text-sm font-medium text-gray-700 mb-1">
            Delivery end
          </label>
          <input
            id="delivery-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-3 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save delivery window'}
      </button>
    </section>
  );
}
