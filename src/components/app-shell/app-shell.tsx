'use client';

/**
 * Authenticated navigation shell.
 * Requirements: Manager Experience 1.1, 1.2, 1.5
 *
 * Wraps the authenticated areas of the app — /teams/[teamId]/* and /me — so a
 * member can move between destinations without knowing URLs. It is mounted by
 * those segments' layouts rather than by a runtime auth check, so an
 * unauthenticated page cannot render it by accident.
 *
 * Team and roles come from GET /api/me, which already resolves the member.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** The subset of GET /api/me the shell depends on. */
interface SessionContext {
  team: { id: string; name: string } | null;
  roles: string[];
}

interface Destination {
  href: string;
  label: string;
}

/**
 * Compares two paths ignoring a trailing slash. Next.js normalises these, but
 * a pathname arriving with one must not leave every destination unmarked.
 */
function samePath(a: string, b: string): boolean {
  const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  return strip(a) === strip(b);
}

function destinationsFor(context: SessionContext): Destination[] {
  const destinations: Destination[] = [];

  if (context.team) {
    destinations.push(
      { href: `/teams/${context.team.id}/dashboard`, label: 'Dashboard' },
      { href: `/teams/${context.team.id}/settings`, label: 'Settings' },
    );
  }

  destinations.push({ href: '/me', label: 'Profile' });

  return destinations;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [context, setContext] = useState<SessionContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) return;

        const body: SessionContext = await res.json();
        if (!cancelled) setContext(body);
      } catch {
        // An unreachable /api/me leaves the page to handle its own error state.
        // A navigation bar is not worth a second error message about.
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {context && (
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
            </div>
          </header>
        </>
      )}

      <main id="main">{children}</main>
    </>
  );
}
