/**
 * Repository layer barrel export and in-memory factory.
 * Services import from here; never from Prisma directly.
 */

import type {
  TeamRepository,
  TeamMemberRepository,
  SessionRepository,
  ResponseRepository,
  SessionLinkRepository,
  MagicLinkRepository,
  AuditLogRepository,
  SessionAggregateRepository,
  QuestionRepository,
  AvailabilityRepository,
  TeamMemberRoleRepository,
  PairingCodeRepository,
  UserSessionRepository,
  PendingGenesisRepository,
  TeamScheduleRepository,
} from './types';

import { InMemoryTeamRepository } from './in-memory/team.repository';
import { InMemoryTeamMemberRepository } from './in-memory/team-member.repository';
import { InMemorySessionRepository } from './in-memory/session.repository';
import { InMemoryResponseRepository } from './in-memory/response.repository';
import { InMemorySessionLinkRepository } from './in-memory/session-link.repository';
import { InMemoryMagicLinkRepository } from './in-memory/magic-link.repository';
import { InMemoryAuditLogRepository } from './in-memory/audit-log.repository';
import { InMemorySessionAggregateRepository } from './in-memory/session-aggregate.repository';
import { InMemoryQuestionRepository } from './in-memory/question.repository';
import { InMemoryAvailabilityRepository } from './in-memory/availability.repository';
import { InMemoryTeamMemberRoleRepository } from './in-memory/team-member-role.repository';
import { InMemoryPairingCodeRepository } from './in-memory/pairing-code.repository';
import { InMemoryUserSessionRepository } from './in-memory/user-session.repository';
import { InMemoryPendingGenesisRepository } from './in-memory/pending-genesis.repository';
import { InMemoryTeamScheduleRepository } from './in-memory/team-schedule.repository';

export interface Repositories {
  team: TeamRepository;
  teamMember: TeamMemberRepository;
  session: SessionRepository;
  response: ResponseRepository;
  sessionLink: SessionLinkRepository;
  magicLink: MagicLinkRepository;
  auditLog: AuditLogRepository;
  sessionAggregate: SessionAggregateRepository;
  question: QuestionRepository;
  availability: AvailabilityRepository;
  teamMemberRole: TeamMemberRoleRepository;
  pairingCode: PairingCodeRepository;
  userSession: UserSessionRepository;
  pendingGenesis: PendingGenesisRepository;
  teamSchedule: TeamScheduleRepository;
}

/**
 * Creates all in-memory repositories pre-wired for test use.
 * The response repository is wired to look up session teamIds
 * from the session repository automatically.
 */
export function createInMemoryRepositories(): Repositories {
  const session = new InMemorySessionRepository();
  const response = new InMemoryResponseRepository((sessionId: string) => {
    const found = session.getAll().find(s => s.id === sessionId);
    return found?.teamId ?? null;
  });

  const team = new InMemoryTeamRepository();
  const teamMember = new InMemoryTeamMemberRepository();
  const sessionLink = new InMemorySessionLinkRepository();
  const magicLink = new InMemoryMagicLinkRepository();
  const auditLog = new InMemoryAuditLogRepository();
  const sessionAggregate = new InMemorySessionAggregateRepository();
  const question = new InMemoryQuestionRepository();
  const availability = new InMemoryAvailabilityRepository();
  const teamMemberRole = new InMemoryTeamMemberRoleRepository();
  const pairingCode = new InMemoryPairingCodeRepository();
  const userSession = new InMemoryUserSessionRepository();
  const pendingGenesis = new InMemoryPendingGenesisRepository();
  const teamSchedule = new InMemoryTeamScheduleRepository();

  return {
    team,
    teamMember,
    session,
    response,
    sessionLink,
    magicLink,
    auditLog,
    sessionAggregate,
    question,
    availability,
    teamMemberRole,
    pairingCode,
    userSession,
    pendingGenesis,
    teamSchedule,
  };
}

export type { Repositories as RepositoriesType };
export * from './types';
export * from './entities';
