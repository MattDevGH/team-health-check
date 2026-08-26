/**
 * Audit Log Page
 * Requirements: 18.4, 18.5
 *
 * Displays team configuration audit log entries in reverse chronological order.
 * Accessible only by delivery_manager role.
 * Implements cursor-based pagination with "Load more" button.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';

interface AuditEntry {
  id: string;
  changeType: string;
  previousValue: string;
  newValue: string;
  userId: string;
  timestamp: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  nextCursor: string | null;
}

interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default function AuditLogPage({ params }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitial() {
      const { teamId: id } = await params;
      if (cancelled) return;
      setTeamId(id);

      try {
        const res = await fetch(`/api/teams/${id}/audit-log`);

        if (res.status === 403) {
          if (!cancelled) {
            setAccessDenied(true);
            setLoading(false);
          }
          return;
        }

        if (!res.ok) {
          if (!cancelled) {
            setError('Failed to load audit log');
            setLoading(false);
          }
          return;
        }

        const data: AuditResponse = await res.json();
        if (!cancelled) {
          setEntries(data.entries);
          setNextCursor(data.nextCursor);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load audit log');
          setLoading(false);
        }
      }
    }

    fetchInitial();
    return () => { cancelled = true; };
  }, [params]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || !teamId || loadingMore) return;

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/audit-log?cursor=${nextCursor}`
      );

      if (!res.ok) {
        setLoadingMore(false);
        return;
      }

      const data: AuditResponse = await res.json();
      setEntries((prev) => [...prev, ...data.entries]);
      setNextCursor(data.nextCursor);
    } catch {
      // Silently handle load more failures
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, teamId, loadingMore]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">Access denied</p>
          <p className="text-gray-500 text-sm mt-2">
            Only delivery managers can view the audit log.
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Audit Log</h1>

        {entries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No audit log entries</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="bg-white rounded-lg shadow p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {entry.changeType}
                  </span>
                  <time
                    className="text-xs text-gray-500"
                    dateTime={entry.timestamp}
                  >
                    {formatTimestamp(entry.timestamp)}
                  </time>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  <span>{entry.previousValue}</span>
                  <span className="mx-2" aria-label="changed to">→</span>
                  <span>{entry.newValue}</span>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  Changed by: {entry.userId}
                </div>
              </article>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="mt-6 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Formats an ISO timestamp to a human-readable date string */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
