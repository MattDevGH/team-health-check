export const TEAM_ROLES = ['delivery_manager', 'team_member'] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export interface MemberSummary {
  id: string;
  teamId: string;
  name: string;
  email: string | null;
  roles: Array<{ role: TeamRole }>;
  slackLink: { slackUserId: string } | null;
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && TEAM_ROLES.includes(value as TeamRole);
}
