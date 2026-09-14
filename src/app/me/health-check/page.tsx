'use client';

/**
 * The member's own health check.
 *
 * Requirements: Reaching Your Health Check 1.2, 1.3, 1.4, 1.5
 *
 * A route that answers "is there anything for me to do?" from anywhere in the
 * application, for any member rather than only a Delivery Manager. A
 * contributor's journey never touches the dashboard — they arrive from a
 * prompt, answer, and leave — so when a check opened on 2026-09-14 and no
 * prompt could reach anyone, there was nowhere for them to go.
 *
 * Under `/me` because that segment already mounts the navigation shell, and
 * because this is genuinely about the reader rather than the team.
 */

import { useEffect, useState } from 'react';

type CheckState =
  | { phase: 'loading' }
  | { phase: 'open'; token: string }
  | { phase: 'none_open' }
  | { phase: 'no_link' }
  | { phase: 'error' };

interface Resolved {
  kind: string;
  token?: string;
}

function isResolved(value: unknown): value is Resolved {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === 'string'
  );
}

export default function MyHealthCheckPage() {
  const [state, setState] = useState<CheckState>({ phase: 'loading' });

  useEffect(() => {
    let current = true;

    async function load() {
      try {
        const res = await fetch('/api/me/health-check');
        if (!res.ok) {
          if (current) setState({ phase: 'error' });
          return;
        }

        const body: unknown = await res.json();
        if (!current) return;

        if (isResolved(body) && body.kind === 'open' && typeof body.token === 'string') {
          setState({ phase: 'open', token: body.token });
        } else if (isResolved(body) && body.kind === 'no_link') {
          setState({ phase: 'no_link' });
        } else {
          setState({ phase: 'none_open' });
        }
      } catch {
        if (current) setState({ phase: 'error' });
      }
    }

    load();

    return () => {
      current = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Health check</h1>

        <div className="bg-white rounded-lg shadow p-6">
          {state.phase === 'loading' && <p className="text-gray-600">Loading...</p>}

          {state.phase === 'open' && (
            <>
              <p className="text-gray-700 mb-4">
                A health check is open. Your answers are saved as you go, and you can change
                them until it closes.
              </p>
              {/*
                A link rather than an automatic redirect. Landing straight in a
                form having clicked "Health check" gives no moment to realise
                what is about to be asked, and no way back without the browser
                button.
              */}
              <a
                href={`/session/${state.token}`}
                className="inline-block py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Answer the health check
              </a>
            </>
          )}

          {state.phase === 'none_open' && (
            <p className="text-gray-700">
              No health check is open at the moment. You will be prompted when the next one
              starts, and this page will have it.
            </p>
          )}

          {state.phase === 'no_link' && (
            /*
              A member added after the check opened has no link for it. Saying
              "nothing is open" here would be false, and handing them another
              member's link would let them answer as that person.
            */
            <p className="text-gray-700">
              A health check is open, but you were not included in it — this happens when
              you join a team after a check has started. Your delivery manager can include
              you in the next one.
            </p>
          )}

          {state.phase === 'error' && (
            <p className="text-red-600" role="alert">
              Could not load your health check. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
