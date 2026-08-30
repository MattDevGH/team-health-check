'use client';

/**
 * Session lifecycle panel.
 * Requirements: Manager Experience 2.1, 2.2, 2.4, 2.7
 *
 * The milestone's reason for existing: until this, a health check could only be
 * opened through the API or by waiting for the scheduler, which is why the
 * end-to-end journey reached for the API at exactly this point.
 *
 * Lives on the dashboard because that is where a manager already goes to read
 * the last results, and "open the next one" follows naturally from that.
 *
 * Which sessions have materialised aggregates comes in as a prop: the dashboard
 * already fetches the trends this is derived from, so the panel costs no extra
 * request.
 */

import { useEffect, useId, useState } from 'react';

import type { HealthCheckSession } from '@/lib/repositories/entities';
import { deriveSessionState, type SessionState } from './derive-session-state';

interface SessionLifecyclePanelProps {
  teamId: string;
  /** Ids of closed sessions whose aggregates exist, from the trends response. */
  materialisedSessionIds: string[];
}

/**
 * The session as it arrives over the wire, with every date an ISO string.
 *
 * Kept distinct from `HealthCheckSession` on purpose: the difference between
 * the two is exactly the parsing step below, and collapsing them would let a
 * string reach a date comparison.
 */
interface WireSession {
  id: string;
  teamId: string;
  status: string;
  scheduledOpenAt: string | null;
  scheduledCloseAt: string | null;
  actualOpenAt: string;
  actualCloseAt: string | null;
  createdAt: string;
}

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

/** How many of the team have answered the open check. */
interface Participation {
  totalCount: number;
  respondedCount: number;
}

/**
 * Fetches participation for one session, or null if it cannot be read.
 *
 * A failed count is not a reason to hide the fact that a check is running, so
 * the caller renders the collecting state either way.
 */
async function fetchParticipation(
  teamId: string,
  sessionId: string,
): Promise<Participation | null> {
  try {
    const res = await fetch(`/api/teams/${teamId}/sessions/${sessionId}/participation`);
    if (!res.ok) return null;

    const data: Participation = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetches the team's sessions, parsed. Returns null if the request failed.
 *
 * Kept free of React state so the effect below updates state from a callback
 * rather than synchronously in its body, and so opening a session can reuse the
 * same fetch without duplicating the parsing.
 */
async function fetchSessions(teamId: string): Promise<HealthCheckSession[] | null> {
  try {
    const res = await fetch(`/api/teams/${teamId}/sessions`);
    if (!res.ok) return null;

    const wire: WireSession[] = await res.json();
    return wire.map(toSession);
  } catch {
    return null;
  }
}

function toSession(wire: WireSession): HealthCheckSession {
  return {
    id: wire.id,
    teamId: wire.teamId,
    status: wire.status,
    scheduledOpenAt: parseDate(wire.scheduledOpenAt),
    scheduledCloseAt: parseDate(wire.scheduledCloseAt),
    actualOpenAt: new Date(wire.actualOpenAt),
    actualCloseAt: parseDate(wire.actualCloseAt),
    createdAt: new Date(wire.createdAt),
  };
}

function formatDate(date: Date | null): string {
  if (!date) return 'an unrecorded date';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** What the manager is told is happening right now. */
function describe(state: SessionState): string {
  switch (state.status) {
    case 'collecting':
      return 'Collecting responses.';
    case 'awaiting_results':
      // Closing does not compute results — a scheduler tick does, shortly
      // after. Saying nothing here would read as nobody having answered.
      return 'This check has closed. Results are still being prepared.';
    case 'idle':
      return `Last health check closed on ${formatDate(state.lastClosed.actualCloseAt)}.`;
    case 'never_run':
      return 'No health check has run for this team yet.';
  }
}

export function SessionLifecyclePanel({
  teamId,
  materialisedSessionIds,
}: SessionLifecyclePanelProps) {
  const headingId = useId();
  const [sessions, setSessions] = useState<HealthCheckSession[] | null>(null);
  // Kept with the session it describes, so a count from a previous check can
  // never be shown against the current one
  const [participation, setParticipation] = useState<{
    sessionId: string;
    data: Participation;
  } | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSessions(teamId).then(loaded => {
      if (!cancelled && loaded) setSessions(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function openSession(): Promise<void> {
    setOpening(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/sessions`, { method: 'POST' });
      if (!res.ok) return;

      // Refetch rather than trusting the created session alone: opening also
      // closes any session that was already open, so the list is the only
      // account of what the team now has
      const loaded = await fetchSessions(teamId);
      if (loaded) setSessions(loaded);
    } finally {
      setOpening(false);
    }
  }

  const state = sessions ? deriveSessionState(sessions, new Set(materialisedSessionIds)) : null;
  const openSessionId = state?.status === 'collecting' ? state.session.id : null;

  // Participation is only meaningful while a check is collecting, and it must
  // follow whichever session is open rather than the one that was open when the
  // panel first rendered
  useEffect(() => {
    if (!openSessionId) return;

    let cancelled = false;

    fetchParticipation(teamId, openSessionId).then(loaded => {
      if (!cancelled && loaded) setParticipation({ sessionId: openSessionId, data: loaded });
    });

    return () => {
      cancelled = true;
    };
  }, [teamId, openSessionId]);

  // Only the count belonging to the session on screen is shown, so a closed
  // check leaves no lingering figure behind
  const currentParticipation =
    openSessionId && participation?.sessionId === openSessionId ? participation.data : null;

  return (
    <section aria-labelledby={headingId} className="bg-white rounded-lg shadow p-4">
      <h2 id={headingId} className="text-lg font-semibold text-gray-800 mb-2">
        Health check
      </h2>

      {state === null ? (
        <p className="text-gray-600">Checking…</p>
      ) : (
        <>
          <p className="text-gray-700">{describe(state)}</p>

          {state.status === 'collecting' && (
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {/* "3 of 8 answered" sidesteps the singular/plural problem
                  entirely, so this needs no pluralise helper */}
              {currentParticipation && (
                <li>
                  {currentParticipation.respondedCount} of {currentParticipation.totalCount}{' '}
                  answered
                </li>
              )}
              {state.session.scheduledCloseAt && (
                <li>Closes on {formatDate(state.session.scheduledCloseAt)}</li>
              )}
            </ul>
          )}

          {state.control === 'open' && (
            <button
              type="button"
              onClick={openSession}
              disabled={opening}
              className="mt-3 rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {opening ? 'Opening…' : 'Open a health check'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
