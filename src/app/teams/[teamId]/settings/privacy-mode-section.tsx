/**
 * Privacy Mode Section — Toggle between anonymous/attributed with confirmation
 * Requirements: 14.4
 */

'use client';

import { useState } from 'react';

interface PrivacyModeProps {
  teamId: string;
  privacyMode: string;
  onUpdated: (mode: string) => void;
}

export function PrivacyModeSection({ teamId, privacyMode, onUpdated }: PrivacyModeProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const isAnonymous = privacyMode === 'anonymous';
  const targetMode = isAnonymous ? 'attributed' : 'anonymous';

  async function handleConfirm() {
    setError('');
    setSaved(false);
    setSaving(true);

    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyMode: targetMode }),
      });

      if (!response.ok) {
        setError('Failed to save privacy mode');
        return;
      }

      onUpdated(targetMode);
      setSaved(true);
      setShowConfirm(false);
    } catch {
      setError('Network error while saving privacy mode');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="privacy-mode-heading">
      <h2 id="privacy-mode-heading" className="text-lg font-semibold text-gray-800 mb-3">
        Privacy Mode
      </h2>
      <p className="mb-3 text-sm text-gray-600">
        Anonymous mode hides who gave which answer, and hides a question theme
        entirely until at least 3 people have answered it — so a small team
        cannot be identified by elimination. Attributed mode shows individual
        answers to delivery managers. Changing this affects how future results
        are shown; it does not re-open answers already given.
      </p>

      <p className="text-sm text-gray-600 mb-2">
        Current mode: <span className="font-medium">{privacyMode}</span>
      </p>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => { setError(''); setSaved(false); setShowConfirm(true); }}
          className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300"
        >
          Switch to {targetMode}
        </button>
      ) : (
        <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md">
          <p className="text-sm text-gray-800 mb-3">
            Are you sure you want to switch to <strong>{targetMode}</strong> mode?
            {targetMode === 'attributed' && (
              <> Individual responses will be visible to authorised roles.</>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      {saved && <p className="mt-2 text-sm text-green-700" role="status">Privacy mode saved.</p>}
    </section>
  );
}
