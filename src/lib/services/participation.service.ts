import type {
  ResponseRepository,
  SessionRepository,
  TeamMemberRepository,
  TeamMemberRoleRepository,
  TeamRepository,
} from '@/lib/repositories/types';
import { NotFoundError } from '@/lib/errors';

export interface ParticipationData {
  totalCount: number;
  respondedCount: number;
  nonResponders: Array<{ id: string; name: string }>;
}

export interface ParticipationServiceDeps {
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
  sessionRepo: SessionRepository;
  responseRepo: ResponseRepository;
}

export interface ParticipationService {
  get(
    expectedTeamId: string,
    sessionId: string,
    requesterMemberId: string,
  ): Promise<ParticipationData>;
}

/** Creates the service that computes privacy-aware session participation data. */
export function createParticipationService(
  deps: ParticipationServiceDeps,
): ParticipationService {
  async function get(
    expectedTeamId: string,
    sessionId: string,
    requesterMemberId: string,
  ): Promise<ParticipationData> {
    const session = await deps.sessionRepo.findById(sessionId);
    if (!session || session.teamId !== expectedTeamId) {
      throw new NotFoundError('Session not found');
    }

    const [members, responses, team] = await Promise.all([
      deps.teamMemberRepo.findByTeamId(expectedTeamId),
      deps.responseRepo.findBySession(sessionId),
      deps.teamRepo.findById(expectedTeamId),
    ]);
    const respondedMemberIds = new Set(responses.map(response => response.memberId));
    const nonResponders = members.filter(member => !respondedMemberIds.has(member.id));

    let canViewNames = team?.privacyMode === 'attributed';
    if (!canViewNames) {
      const roles = await deps.teamMemberRoleRepo.findByMemberAndTeam(
        requesterMemberId,
        expectedTeamId,
      );
      canViewNames = roles.some(role => role.role === 'delivery_manager');
    }

    return {
      totalCount: members.length,
      respondedCount: respondedMemberIds.size,
      nonResponders: canViewNames
        ? nonResponders.map(member => ({ id: member.id, name: member.name }))
        : [],
    };
  }

  return { get };
}
