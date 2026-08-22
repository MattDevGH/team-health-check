import { isTeamRole, type MemberSummary } from '@/lib/contracts/member-summary';
import type { SlackIdentityLinkRepository, TeamMemberRoleRepository } from '@/lib/repositories/types';
import type { TeamMember } from '@/lib/repositories/entities';

export async function assembleMemberSummary(
  member: TeamMember,
  roleRepo: TeamMemberRoleRepository,
  slackRepo?: SlackIdentityLinkRepository,
): Promise<MemberSummary> {
  const [storedRoles, slackLink] = await Promise.all([
    roleRepo.findByMemberAndTeam(member.id, member.teamId),
    slackRepo?.findByMemberId(member.id) ?? Promise.resolve(null),
  ]);
  return {
    id: member.id,
    teamId: member.teamId,
    name: member.name,
    email: member.email,
    roles: storedRoles.flatMap(({ role }) => isTeamRole(role) ? [{ role }] : []),
    slackLink: slackLink ? { slackUserId: slackLink.slackUserId } : null,
  };
}
