/**
 * The navigation context for the layout currently rendering.
 *
 * Requirements: Feeling Responsive 1.1, 2.1, 2.3
 *
 * Separate from `shell-context.ts` so the rule stays testable without Next's
 * request APIs: that module is a function of a token and repositories, this one
 * knows where the token comes from and which repositories are real.
 *
 * No `server-only` import: it is not a dependency here, and `next/headers` already
 * refuses to load in a Client Component, which is the same protection by a
 * different route.
 *
 * `cookies()` is awaited and opts the route into dynamic rendering. That is
 * already true of every page under these layouts — they are per-member and
 * per-request by nature — so nothing is lost by saying so explicitly.
 */

import { cookies } from 'next/headers';

import { COOKIE_NAME } from '@/lib/auth/session-cookie';
import { resolveShellContext } from '@/lib/auth/shell-context';
import { repos } from '@/lib/container-production';
import type { ShellContext } from '@/components/app-shell/destinations';

export async function currentShellContext(): Promise<ShellContext | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;

  try {
    return await resolveShellContext(
      {
        userSessionRepo: repos.userSession,
        teamMemberRepo: repos.teamMember,
        teamRepo: repos.team,
        teamMemberRoleRepo: repos.teamMemberRole,
      },
      token,
    );
  } catch {
    /*
     * A database that cannot be reached costs the navigation, not the page.
     *
     * The client fetch this replaced behaved the same way, and the reasoning
     * has not changed: a navigation bar is not worth a second error message
     * about, and throwing here would turn a blip into a blank screen for a page
     * that might have rendered from its own data perfectly well.
     */
    return null;
  }
}
