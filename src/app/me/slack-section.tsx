/**
 * Slack link/unlink section.
 * Requirements: 2.2, 2.3, 2.4, 2.6, 7.1, 7.2
 *
 * When unlinked, shows a pairing-code input so a member can complete the
 * `/healthcheck connect` linking flow from the web interface. When linked,
 * shows the linked status and an unlink button with confirmation.
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
  const [linked, setLinked] = useState(slackLink);
  const [code, setCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const currentLink = unlinked ? null : linked;

  async function handleLink() {
    if (!code.trim() || linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch('/api/auth/slack-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        const body = await res.json();
        setLinked({ slackUserId: body.slackUserId });
        setUnlinked(false);
        setCode('');
      } else {
        const body = await res.json().catch(() => null);
        setLinkError(body?.error?.message ?? 'Invalid or expired pairing code');
      }
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    const res = await fetch('/api/me/slack-link', { method: 'DELETE' });
    if (res.ok) {
      setUnlinked(true);
      setConfirming(false);
    }
  }

  if (!currentLink) {
    return (
      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Slack</h2>
        <p className="text-sm text-gray-500 mb-2">No Slack account linked</p>
        <div className="space-y-2">
          <div>
            <label htmlFor="slack-pairing-code" className="block text-xs text-gray-500">
              Pairing code
            </label>
            <input
              id="slack-pairing-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code from /healthcheck connect"
              className="mt-1 block w-full rounded border-gray-300 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleLink}
            disabled={!code.trim() || linking}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md disabled:opacity-50"
          >
            Link Slack
          </button>
          {linkError && (
            <p role="alert" className="text-xs text-red-600 mt-1">{linkError}</p>
          )}
        </div>
      </section>
    );
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
