/**
 * Slack link/unlink section.
 * Requirements: 2.6
 *
 * Shows Slack linked status and provides unlink button with confirmation.
 */

'use client';

import { useState } from 'react';

interface SlackLink {
  slackUserId: string;
}

interface SlackSectionProps {
  slackLink: SlackLink | null;
}

export function SlackSection({ slackLink }: SlackSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [unlinked, setUnlinked] = useState(false);

  if (!slackLink || unlinked) {
    return (
      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Slack</h2>
        <p className="text-sm text-gray-500">No Slack account linked</p>
      </section>
    );
  }

  async function handleUnlink() {
    const res = await fetch('/api/me/slack-link', { method: 'DELETE' });
    if (res.ok) {
      setUnlinked(true);
      setConfirming(false);
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Slack</h2>
      <p className="text-sm text-gray-600 mb-2">Slack linked</p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm text-red-600 underline"
        >
          Unlink Slack
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-red-600">Are you sure you want to unlink Slack?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUnlink}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
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
