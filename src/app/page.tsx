'use client';

/**
 * Homepage.
 *
 * Two audiences reach this route. Someone arriving cold needs to know what the
 * product is and how to get in. Someone who has just signed in needs the app —
 * magic-link verification and genesis both land here once the session cookie is
 * set, and until 2026-09-10 they were shown a page whose primary action was
 * "Sign in with magic link". Signing in successfully delivered a member to an
 * invitation to sign in, and the only way onward was to know a URL.
 *
 * Resolving it here rather than at each redirect covers every caller: magic
 * link, genesis, and anyone who simply types the address.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Session {
  team: { id: string } | null;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const team = (value as { team?: unknown }).team;
  if (team === null) return true;
  return (
    typeof team === 'object' &&
    team !== null &&
    typeof (team as { id?: unknown }).id === 'string'
  );
}

export default function Home() {
  const router = useRouter();

  /**
   * `checking` until the session is known.
   *
   * Rendering the marketing copy first would show a signed-in member a sign-in
   * button for as long as the request takes, which is the exact confusion this
   * page exists to end.
   */
  const [state, setState] = useState<'checking' | 'anonymous'>('checking');

  useEffect(() => {
    let current = true;

    async function resolveDestination() {
      try {
        const res = await fetch('/api/me');

        if (res.ok) {
          const profile: unknown = await res.json();

          /**
           * Only a team the server actually resolved earns a redirect. A
           * guessed id produces a link that 404s, which is worse than a page
           * that explains itself. The Prisma foreign key makes a null team
           * unreachable in production.
           */
          if (isSession(profile) && profile.team) {
            /**
             * replace, not push: push would leave `/` in the history directly
             * behind the dashboard, so Back would redirect straight forward
             * again and trap the member with no way out.
             */
            router.replace(`/teams/${profile.team.id}/dashboard`);
            return;
          }
        }
      } catch {
        // An unreachable API is indistinguishable from being signed out, and
        // the honest response to both is to offer the way in.
      }

      if (current) setState('anonymous');
    }

    resolveDestination();

    return () => {
      current = false;
    };
  }, [router]);

  if (state === 'checking') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Team Health Check
        </h1>
        <p className="text-gray-600 mb-8">
          Lightweight feedback for delivery teams. Rate how things are going,
          track trends over time, and surface what needs attention.
        </p>

        <a
          href="/auth/login"
          className="inline-block w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sign in with magic link
        </a>

        <p className="mt-6 text-sm text-gray-600">
          Got a session link from Slack or email? Click it directly — no sign-in needed.
        </p>
      </div>
    </main>
  );
}
