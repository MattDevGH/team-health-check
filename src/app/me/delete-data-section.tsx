/**
 * Delete my data section with strong confirmation.
 * Requirements: NFR 4.3
 *
 * Requires typing "DELETE" to confirm data deletion.
 */

'use client';

import { useState } from 'react';

export function DeleteDataSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function handleDelete() {
    if (confirmText !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/me/delete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        setDeleted(true);
        setShowConfirm(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <section className="bg-white rounded-lg shadow p-4 border border-green-200">
        <p className="text-sm text-green-700">Your data has been deleted.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 border border-red-100">
      <h2 className="text-sm font-semibold text-red-700 mb-2">Danger Zone</h2>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="text-sm text-red-600 underline"
        >
          Delete My Data
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            This will permanently delete all your response data. Aggregated trends will be preserved.
          </p>
          <label htmlFor="delete-confirm" className="block text-xs text-gray-600">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="block w-full rounded border-gray-300 text-sm"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || deleting}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded disabled:opacity-50"
            >
              Confirm Deletion
            </button>
            <button
              type="button"
              onClick={() => { setShowConfirm(false); setConfirmText(''); }}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
