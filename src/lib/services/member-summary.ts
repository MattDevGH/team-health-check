import {
  isTeamRole,
  type MemberSummary,
  type TeamRole,
} from '@/lib/contracts/member-summary';
import type { TeamMember } from '@/lib/repositories/entities';
import type {
  SlackIdentityLinkRepository,
  TeamMemberRoleRepository,
} from '@/lib/repositories/types';

type MemberIdentity = Pick<TeamMember, 'id' | 'teamId' | 'name' | 'email'>;

export function buildMemberSummary(
  member: MemberIdentity,
  roles: TeamRole[],
  slackUserId: string | null,
): MemberSummary {
  return {
    id: member.id,
    teamId: member.teamId,
    name: member.name,
    email: member.email,
    roles: roles.map(role => ({ role })),
    slackLink: slackUserId ? { slackUserId } : null,
  };
}

export async function assembleMemberSummary(
  member: TeamMember,
  roleRepo: TeamMemberRoleRepository,
  slackRepo?: SlackIdentityLinkRepository,
): Promise<MemberSummary> {
  const [storedRoles, slackLink] = await Promise.all([
    roleRepo.findByMemberAndTeam(member.id, member.teamId),
    slackRepo?.findByMemberId(member.id) ?? Promise.resolve(null),
  ]);
  const roles = storedRoles.flatMap(({ role }) => isTeamRole(role) ? [role] : []);
  return buildMemberSummary(member, roles, slackLink?.slackUserId ?? null);
}
