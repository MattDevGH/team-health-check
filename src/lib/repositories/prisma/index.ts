/**
 * Prisma repository factory.
 * Creates production repository instances backed by PrismaClient.
 * Route handlers use the production container which calls this factory.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { Repositories } from '../index';
import { PrismaTeamRepository } from './team.repository';
import { PrismaTeamMemberRepository } from './team-member.repository';
import { PrismaSessionRepository } from './session.repository';
import { PrismaResponseRepository } from './response.repository';
import { PrismaSessionLinkRepository } from './session-link.repository';
import { PrismaMagicLinkRepository } from './magic-link.repository';
import { PrismaAuditLogRepository } from './audit-log.repository';
import { PrismaSessionAggregateRepository } from './session-aggregate.repository';
import { PrismaQuestionRepository } from './question.repository';
import { PrismaAvailabilityRepository } from './availability.repository';
import { PrismaTeamMemberRoleRepository } from './team-member-role.repository';
import { PrismaPairingCodeRepository } from './pairing-code.repository';
import { PrismaUserSessionRepository } from './user-session.repository';
import { PrismaPendingGenesisRepository } from './pending-genesis.repository';
import { PrismaTeamScheduleRepository } from './team-schedule.repository';
import { PrismaSlackIdentityLinkRepository } from './slack-identity-link.repository';
import { PrismaNotificationDeliveryRepository } from './notification-delivery.repository';

/**
 * Creates all Prisma-backed repository instances.
 * Accepts a configured PrismaClient and returns the full Repositories interface.
 */
export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  return {
    team: new PrismaTeamRepository(prisma),
    teamMember: new PrismaTeamMemberRepository(prisma),
    session: new PrismaSessionRepository(prisma),
    response: new PrismaResponseRepository(prisma),
    sessionLink: new PrismaSessionLinkRepository(prisma),
    magicLink: new PrismaMagicLinkRepository(prisma),
    auditLog: new PrismaAuditLogRepository(prisma),
    sessionAggregate: new PrismaSessionAggregateRepository(prisma),
    question: new PrismaQuestionRepository(prisma),
    availability: new PrismaAvailabilityRepository(prisma),
    teamMemberRole: new PrismaTeamMemberRoleRepository(prisma),
    pairingCode: new PrismaPairingCodeRepository(prisma),
    userSession: new PrismaUserSessionRepository(prisma),
    pendingGenesis: new PrismaPendingGenesisRepository(prisma),
    teamSchedule: new PrismaTeamScheduleRepository(prisma),
    slackIdentityLink: new PrismaSlackIdentityLinkRepository(prisma),
    notificationDelivery: new PrismaNotificationDeliveryRepository(prisma),
  };
}

export { PrismaTeamRepository } from './team.repository';
export { PrismaTeamMemberRepository } from './team-member.repository';
export { PrismaSessionRepository } from './session.repository';
export { PrismaResponseRepository } from './response.repository';
export { PrismaAuditLogRepository } from './audit-log.repository';
export { PrismaSessionAggregateRepository } from './session-aggregate.repository';
export { PrismaSessionLinkRepository } from './session-link.repository';
export { PrismaMagicLinkRepository } from './magic-link.repository';
export { PrismaQuestionRepository } from './question.repository';
export { PrismaAvailabilityRepository } from './availability.repository';
export { PrismaTeamMemberRoleRepository } from './team-member-role.repository';
export { PrismaPairingCodeRepository } from './pairing-code.repository';
export { PrismaUserSessionRepository } from './user-session.repository';
export { PrismaPendingGenesisRepository } from './pending-genesis.repository';
export { PrismaTeamScheduleRepository } from './team-schedule.repository';
export { PrismaSlackIdentityLinkRepository } from './slack-identity-link.repository';
export { PrismaNotificationDeliveryRepository } from './notification-delivery.repository';
