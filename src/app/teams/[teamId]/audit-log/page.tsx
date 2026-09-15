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

import { describeAuditValue, describeChangeType, type AuditValueView } from './audit-value';

/** Who made a change, resolved by the server. */
interface AuditActor {
  id: string;
  name: string | null;
  isViewer: boolean;
  isErased: boolean;
}

/**
 * Names the actor for a reader.
 *
 * A raw id is never shown: it told the reader nothing, and reading the log
 * should not require a database. Where the actor genuinely cannot be named, the
 * log says why rather than falling back to the identifier.
 */
function describeActor(actor: AuditActor | undefined): string {
  if (!actor) return 'Unknown';
  if (actor.isViewer) return 'You';
  if (actor.name) return actor.name;
  // The erasure hash exists so this person cannot be identified
  if (actor.isErased) return 'A deleted account';
  return 'A former member';
}

interface AuditEntry {
  id: string;
  changeType: string;
  previousValue: string;
  newValue: string;
  actor?: AuditActor;
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

/**
 * What to show when there was nothing before.
 *
 * Two routes write that: `team.service.ts` records the literal string "null"
 * for a first schedule configuration, and team creation and member addition
 * record an empty string. Both surfaced raw — a production log read
 * `null→{"cadence":"weekly",…}`, which is a database artefact reaching an
 * interface whose entire job is being understood by a person.
 */
function describePreviousValue(previousValue: string): AuditValueView {
  const nothing = previousValue.trim() === '' || previousValue.trim() === 'null';
  return nothing
    ? { kind: 'text', text: 'No previous value' }
    : describeAuditValue(previousValue);
}

/**
 * One stored value, as a person reads it.
 *
 * Most are already plain — "anonymous", a team name — and are shown exactly
 * as they were stored. A value stored as JSON becomes labelled lines, because
 * a production log read `{"cadence":"weekly","openDay":1,…}` on a screen whose
 * entire job is being understood by a person months later.
 */
function AuditValue({ view }: { view: AuditValueView }) {
  if (view.kind === 'text') return <>{view.text}</>;

  /*
    A list rather than a nested definition list: this sits inside the Before
    and After definitions already, and nesting a `dl` inside a `dd` reads to
    a screen reader as a description of a description.
  */
  return (
    <ul className="space-y-0.5">
      {view.fields.map(field => (
        <li key={field.label}>
          <span className="text-gray-700">{field.label}</span>
          {/* A colon rather than a separate element: it is punctuation, not
              content, and a screen reader should read it as the pause it is */}
          <span className="text-gray-500">: </span>
          {field.value}
        </li>
      ))}
    </ul>
  );
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">Access denied</p>
          <p className="text-gray-500 text-sm mt-2">
            Only delivery managers can view the audit log.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
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
                  {/*
                    The stored type stays on the element, so an entry can be
                    correlated with a system record without a manager having to
                    read a token. Requirement 18 says this screen is for a
                    delivery manager understanding their own team’s history.
                  */}
                  <span
                    className="text-sm font-semibold text-gray-800"
                    data-change-type={entry.changeType}
                  >
                    {describeChangeType(entry.changeType)}
                  </span>
                  <time
                    className="text-xs text-gray-500"
                    dateTime={entry.timestamp}
                  >
                    {formatTimestamp(entry.timestamp)}
                  </time>
                </div>
                {/*
                  Labelled rather than joined by an arrow.
                  
                  An arrow between two unlabelled blobs asks the reader to
                  infer which is which, and carried its meaning only visually —
                  `aria-label` on a decorative span does less than it looks.
                  This screen exists to be understood by a person months later.
                  
                  `break-all` on the value itself, where it is inherited by
                  whatever the formatter produced. A value that is still shown
                  raw can be one long string with no spaces to break on, which
                  the default wrapping cannot help with, so it ran past the edge
                  of its card.
                */}
                <dl className="mt-2 text-sm text-gray-600">
                  <dt className="font-medium text-gray-700">Before</dt>
                  <dd data-audit-value className="mb-2 break-all">
                    <AuditValue view={describePreviousValue(entry.previousValue)} />
                  </dd>
                  <dt className="font-medium text-gray-700">After</dt>
                  <dd data-audit-value className="break-all">
                    <AuditValue view={describeAuditValue(entry.newValue)} />
                  </dd>
                </dl>
                <div className="mt-1 text-xs text-gray-600">
                  Changed by: {describeActor(entry.actor)}
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
    </div>
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
