import { isTeamRole, type MemberSummary } from '@/lib/contracts/member-summary';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeMember(value: unknown): MemberSummary | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null;

  const roles = Array.isArray(value.roles)
    ? value.roles.flatMap((entry) => isRecord(entry) && isTeamRole(entry.role) ? [{ role: entry.role }] : [])
    : [];
  const slackLink = isRecord(value.slackLink) && typeof value.slackLink.slackUserId === 'string'
    ? { slackUserId: value.slackLink.slackUserId }
    : null;

  return {
    id: value.id,
    teamId: typeof value.teamId === 'string' ? value.teamId : '',
    name: value.name,
    email: typeof value.email === 'string' ? value.email : null,
    roles,
    slackLink,
  };
}

export function normalizeMembers(value: unknown): MemberSummary[] {
  return Array.isArray(value) ? value.flatMap((member) => {
    const normalized = normalizeMember(member);
    return normalized ? [normalized] : [];
  }) : [];
}

export function apiErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value.error)) return fallback;
  if (typeof value.error.message === 'string') return value.error.message;
  const first = Array.isArray(value.error.errors) ? value.error.errors[0] : undefined;
  return isRecord(first) && typeof first.message === 'string' ? first.message : fallback;
}
