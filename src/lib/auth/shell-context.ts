/**
 * What the navigation shell needs, resolved on the server.
 *
 * Requirements: Feeling Responsive 1.1, 2.1, 2.3
 *
 * The shell used to fetch `/api/me` after hydration. That cost a round trip on
 * every authenticated page, and it made the menu arrive in two pieces: the
 * destinations that need no team id, then the rest once the request landed.
 * Resolving it in the layout means the HTML leaves the server with the
 * navigation already complete.
 *
 * Takes a token rather than a request, because a Server Component reads cookies
 * through `cookies()` and has no NextRequest to hand. The repositories arrive as
 * dependencies for the same reason every service here does: so the rule can be
 * exercised without a database.
 */

import type { ShellContext } from '@/components/app-shell/destinations';
import type {
  TeamMemberRepository,
  TeamMemberRoleRepository,
  TeamRepository,
  UserSessionRepository,
} from '@/lib/repositories/types';

export interface ShellContextDeps {
  userSessionRepo: UserSessionRepository;
  teamMemberRepo: TeamMemberRepository;
  teamRepo: TeamRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
}

/**
 * Resolves the signed-in member's navigation context, or null if there is none.
 *
 * Null means no shell at all — not an empty one. A navigation bar rendered for
 * an expired session shows a member an application they have been signed out
 * of, and every link in it leads to a 401.
 */
export async function resolveShellContext(
  deps: ShellContextDeps,
  token: string | undefined,
): Promise<ShellContext | null> {
  if (!token) return null;

  const session = await deps.userSessionRepo.findByToken(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;

  const member = await deps.teamMemberRepo.findById(session.memberId);
  if (!member) return null;

  /*
   * The team and the roles, together.
   *
   * Roles are looked up by member and team, so they cannot start before the
   * team is known — but the team lookup is the only thing they wait for, and
   * neither waits for the other's result to be read.
   */
  const team = await deps.teamRepo.findById(member.teamId);

  /*
   * A member whose team cannot be read gets a shell with no team, mirroring
   * `/api/me`. The shell then offers what needs no team id — the health check
   * and the profile — rather than links built from an id it had to guess.
   */
  if (!team) return { team: null, roles: [] };

  const roles = await deps.teamMemberRoleRepo.findByMemberAndTeam(member.id, team.id);

  return {
    team: { id: team.id, name: team.name },
    roles: roles.map(role => role.role),
  };
}
