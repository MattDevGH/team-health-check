'use client';

/**
 * Authenticated navigation shell.
 * Requirements: Manager Experience 1.1, 1.2, 1.5; Feeling Responsive 1.1, 2.1
 *
 * Wraps the authenticated areas of the app — /teams/[teamId]/* and /me — so a
 * member can move between destinations without knowing URLs. It is mounted by
 * those segments' layouts rather than by a runtime auth check, so an
 * unauthenticated page cannot render it by accident.
 *
 * **The context is given, not fetched.** This used to request `/api/me` after
 * hydration, which cost a round trip on every authenticated page and made the
 * menu arrive in two pieces: the destinations needing no team id, then the rest
 * once the request landed. A delivery manager described watching it fill in.
 * The layouts resolve it on the server now, so the navigation is complete in
 * the HTML.
 *
 * Still a Client Component, because signing out is interactive and the current
 * destination depends on the pathname. A Server Component parent handing props
 * to a Client Component child is the ordinary arrangement.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { destinationsFor, type ShellContext } from './destinations';
import { ShellContextProvider } from './shell-context';

/**
 * Compares two paths ignoring a trailing slash. Next.js normalises these, but
 * a pathname arriving with one must not leave every destination unmarked.
 */
function samePath(a: string, b: string): boolean {
  const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  return strip(a) === strip(b);
}

export interface AppShellProps {
  children: React.ReactNode;
  /**
   * The signed-in member's team and roles, resolved by the layout.
   *
   * Null means no shell at all rather than an empty one: a navigation bar
   * rendered for a session the server could not resolve shows a member an
   * application they are not signed in to, and every link in it leads to a 401.
   */
  context: ShellContext | null;
}

export function AppShell({ children, context }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /**
   * Revokes the session on the server before leaving. Clearing the cookie in
   * the browser alone would leave a working token on record, so the member is
   * kept where they are if the request fails rather than being told they are
   * signed out when they are not.
   */
  async function signOut(): Promise<void> {
    setSigningOut(true);
    setSignOutError(null);

    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        setSignOutError('We could not sign you out. Please try again.');
        setSigningOut(false);
        return;
      }
    } catch {
      setSignOutError('We could not sign you out. Please try again.');
      setSigningOut(false);
      return;
    }

    router.push('/');
    // Discard the client router cache, or going Back re-renders a cached
    // authenticated page after the session behind it has been revoked
    router.refresh();
  }

  return (
    <>
      {context !== null && (
        <>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-gray-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-blue-700"
          >
            Skip to main content
          </a>

          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              {context.team && (
                <span className="font-semibold text-gray-900">{context.team.name}</span>
              )}

              <nav aria-label="Main">
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {destinationsFor(context).map((destination) => {
                    const current = samePath(pathname, destination.href);
                    return (
                      <li key={destination.href}>
                        <Link
                          href={destination.href}
                          aria-current={current ? 'page' : undefined}
                          className={
                            current
                              ? 'font-semibold text-gray-900 underline decoration-2 underline-offset-4'
                              : 'text-gray-700 hover:underline'
                          }
                        >
                          {destination.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* An action, not a destination, so it sits outside the nav list */}
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="ml-auto rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>

            {signOutError && (
              <p role="status" className="mx-auto max-w-3xl px-4 pb-3 text-sm text-red-700">
                {signOutError}
              </p>
            )}
          </header>
        </>
      )}

      {/*
        tabIndex -1 makes the skip link's target focusable programmatically
        without adding it to the tab sequence. Without it, browsers only move
        the sequential navigation start point, so focus stays on the link and a
        screen reader is never told it arrived.
      */}
      <main id="main" tabIndex={-1}>
        {/*
          The same context the navigation was built from, offered to the pages
          inside it. A layout cannot pass props to its page, and the dashboard
          needed the roles badly enough to fetch them again.
        */}
        <ShellContextProvider context={context}>{children}</ShellContextProvider>
      </main>
    </>
  );
}
