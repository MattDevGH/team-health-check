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
 * Loading is distinct from unauthenticated. While `/api/me` is in flight the
 * landmark stays put and offers only what is knowable without a team id;
 * an unauthenticated or unreachable response removes the shell entirely and
 * leaves the page to explain itself.
 */
type ShellState =
  | { status: 'loading' }
  | { status: 'ready'; context: SessionContext }
  | { status: 'anonymous' };

/** The role that gates destinations a member would otherwise be refused. */
const DELIVERY_MANAGER = 'delivery_manager';

/**
 * Compares two paths ignoring a trailing slash. Next.js normalises these, but
 * a pathname arriving with one must not leave every destination unmarked.
 */
function samePath(a: string, b: string): boolean {
  const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  return strip(a) === strip(b);
}

/**
 * The destinations this member can actually reach.
 *
 * A null context is the in-flight state: the team id is not yet known, and a
 * guessed one would produce links that 404. The audit log is the only
 * Delivery-Manager-only read in the API, so it is the only role-gated entry
 * here; every other manager-gated route is a write behind a control on a page
 * both roles can open.
 */
function destinationsFor(context: SessionContext | null): Destination[] {
  const destinations: Destination[] = [];

  if (context?.team) {
    destinations.push(
      { href: `/teams/${context.team.id}/dashboard`, label: 'Dashboard' },
      { href: `/teams/${context.team.id}/settings`, label: 'Settings' },
    );

    if (context.roles.includes(DELIVERY_MANAGER)) {
      destinations.push({ href: `/teams/${context.team.id}/audit-log`, label: 'Audit log' });
    }
  }

  destinations.push({ href: '/me', label: 'Profile' });

  return destinations;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<ShellState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) {
          if (!cancelled) setState({ status: 'anonymous' });
          return;
        }

        const context: SessionContext = await res.json();
        if (!cancelled) setState({ status: 'ready', context });
      } catch {
        // An unreachable /api/me leaves the page to handle its own error state.
        // A navigation bar is not worth a second error message about.
        if (!cancelled) setState({ status: 'anonymous' });
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const context = state.status === 'ready' ? state.context : null;

  return (
    <>
      {state.status !== 'anonymous' && (
        <>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-gray-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-blue-700"
          >
            Skip to main content
          </a>

          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              {context?.team && (
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
