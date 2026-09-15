/**
 * A member's own profile: who they are, their team, their roles, their Slack link.
 *
 * Requirements: Feeling Responsive 3.1, 3.3; Original 13.1, 15.1, 2.1, 2.4
 *
 * Lifted out of the `/api/me` route, which assembled it inline — four repository
 * calls in a handler the architecture rules say should validate input, call a
 * service, and format a response. Extracting it makes the route thin and makes
 * the dependency graph testable, which is what this milestone needs: the
 * question "does this wait for that?" cannot be asked of code with no seam.
 *
 * The queries were sequential, and two of them had no reason to be.
 */

import type { TeamMember } from '@/lib/repositories/entities';
import type {
  SlackIdentityLinkRepository,
  TeamMemberRepository,
  TeamMemberRoleRepository,
  TeamRepository,
} from '@/lib/repositories/types';

export interface MemberProfileDeps {
  teamMemberRepo: TeamMemberRepository;
  slackIdentityLinkRepo: SlackIdentityLinkRepository;
  teamRepo: TeamRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
}

export interface MemberProfile extends TeamMember {
  slackLink: { slackUserId: string } | null;
  /**
   * privacyMode travels with the team because it is a team setting, and because
   * the profile page needs it to tell a member whether their individual answers
   * can be attributed to them.
   */
  team: { id: string; name: string; privacyMode: string } | null;
  roles: string[];
}

export async function resolveMemberProfile(
  deps: MemberProfileDeps,
  memberId: string,
): Promise<MemberProfile | null> {
  /*
   * The member first, alone.
   *
   * Everything else is a query on their behalf, so fanning out before this
   * resolves would mean asking about somebody who may not exist.
   */
  const member = await deps.teamMemberRepo.findById(memberId);
  if (!member) return null;

  /*
   * The Slack link, the team and the roles together.
   *
   * All three need only the member, and none needs another's result, so
   * awaiting them in turn made two of them wait for no reason. Reads only:
   * nothing here writes, so there is no ordering to preserve.
   *
   * The roles were sequential at first, on the reasoning that they are looked
   * up by member *and team* and so had to follow the team. That was wrong, and
   * a surviving mutation said so: they are looked up by team **id**, which the
   * member row already carries. The team lookup supplies the name and the
   * privacy mode, which the roles query has no use for.
   */
  const [slackIdentityLink, teamRecord, roleRecords] = await Promise.all([
    deps.slackIdentityLinkRepo.findByMemberId(memberId),
    deps.teamRepo.findById(member.teamId),
    deps.teamMemberRoleRepo.findByMemberAndTeam(member.id, member.teamId),
  ]);

  const slackLink = slackIdentityLink ? { slackUserId: slackIdentityLink.slackUserId } : null;

  /*
   * Prisma enforces the team foreign key, so an unresolvable team is
   * unreachable in production. When it cannot be resolved the caller is told
   * nothing rather than being handed an id it cannot name — and the roles
   * fetched alongside it are dropped, since a role on a team nobody can name
   * is not something to report.
   */
  if (!teamRecord) {
    return { ...member, slackLink, team: null, roles: [] };
  }

  return {
    ...member,
    slackLink,
    team: { id: teamRecord.id, name: teamRecord.name, privacyMode: teamRecord.privacyMode },
    roles: roleRecords.map(role => role.role),
  };
}
