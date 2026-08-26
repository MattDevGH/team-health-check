/**
 * Team Details Section — Edit name and description
 * Requirements: 1.1
 */

'use client';

import { useState } from 'react';

interface TeamDetailsProps {
  teamId: string;
  name: string;
  description: string;
  onUpdated: (team: { name: string; description: string }) => void;
}

export function TeamDetailsSection({ teamId, name, description, onUpdated }: TeamDetailsProps) {
  const [formName, setFormName] = useState(name);
  const [formDescription, setFormDescription] = useState(description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, description: formDescription }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.errors?.[0]?.message ?? 'Failed to save');
        setSaving(false);
        return;
      }

      const updated = await res.json();
      onUpdated({ name: updated.name, description: updated.description });
    } catch {
      setError('Network error');
    }

    setSaving(false);
  }

  return (
    <section aria-labelledby="team-details-heading">
      <h2 id="team-details-heading" className="text-lg font-semibold text-gray-800 mb-3">
        Team Details
      </h2>

      <div className="space-y-3">
        <div>
          <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-1">
            Team name
          </label>
          <input
            id="team-name"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="team-description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="team-description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </section>
  );
}
