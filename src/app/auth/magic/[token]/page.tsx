'use client';

/**
 * Magic Link Verification Page
 * Requirements: 7.3, 7.9
 *
 * On mount, verifies the magic link token via the API.
 * - Authenticated: redirects to dashboard
 * - Genesis (new user): shows team creation form
 * - Error (expired/used): shows error with link to request new one
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type VerifyState =
  | { phase: 'loading' }
  | { phase: 'authenticated' }
  | { phase: 'genesis'; pendingToken: string; email: string }
  | { phase: 'error'; message: string };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function MagicLinkPage({ params }: PageProps) {
  const router = useRouter();
  const [state, setState] = useState<VerifyState>({ phase: 'loading' });
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const { token } = await params;

      try {
        const res = await fetch(`/api/auth/magic-link/verify/${token}`);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setState({
              phase: 'error',
              message: body.error ?? 'Magic link is expired or has already been used',
            });
          }
          return;
        }

        const data = await res.json();

        if (cancelled) return;

        if (data.status === 'authenticated') {
          setState({ phase: 'authenticated' });
          router.push('/');
        } else if (data.status === 'requires_team_creation') {
          setState({
            phase: 'genesis',
            pendingToken: data.pendingToken,
            email: data.email,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ phase: 'error', message: 'Something went wrong. Please try again.' });
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [params, router]);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!teamName.trim()) {
      setFormError('Team name is required');
      return;
    }

    if (state.phase !== 'genesis') return;

    setIsSubmitting(true);

    try {
      const body: Record<string, string> = {
        token: state.pendingToken,
        teamName: teamName.trim(),
      };
      if (description.trim()) {
        body.description = description.trim();
      }

      const res = await fetch('/api/teams/genesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? 'Failed to create team. Please try again.');
        setIsSubmitting(false);
        return;
      }

      router.push('/');
    } catch {
      setFormError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  if (state.phase === 'loading' || state.phase === 'authenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-600">Verifying your link...</p>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-red-600 font-medium mb-4">{state.message}</p>
          <a
            href="/auth/login"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  // Genesis state: team creation form
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Create your team</h1>
        <p className="text-sm text-gray-500 mb-6">
          Welcome, <span className="font-medium">{state.email}</span>. Set up your first team to get started.
        </p>

        <form onSubmit={handleCreateTeam} noValidate>
          <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-1">
            Team name
          </label>
          <input
            id="teamName"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. Platform Engineering"
            maxLength={100}
            disabled={isSubmitting}
          />

          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1 mt-4">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional team description"
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
          />

          {formError && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating...' : 'Create team'}
          </button>
        </form>
      </div>
    </main>
  );
}
