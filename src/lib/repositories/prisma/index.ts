/**
 * Prisma repository factory.
 * Creates production repository instances backed by PrismaClient.
 * As individual Prisma repositories are built (tasks 18.1–18.4),
 * this factory will wire them in place of the placeholder.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { Repositories } from '../index';
import { PrismaTeamRepository } from './team.repository';
import { PrismaTeamMemberRepository } from './team-member.repository';
import { PrismaAuditLogRepository } from './audit-log.repository';
import { PrismaSessionAggregateRepository } from './session-aggregate.repository';
import { PrismaSessionLinkRepository } from './session-link.repository';
import { PrismaMagicLinkRepository } from './magic-link.repository';
import { PrismaPairingCodeRepository } from './pairing-code.repository';
import { PrismaUserSessionRepository } from './user-session.repository';
import { PrismaPendingGenesisRepository } from './pending-genesis.repository';

/**
 * Creates all Prisma-backed repository instances.
 * Accepts a configured PrismaClient and returns the full Repositories interface.
 *
 * NOTE: Prisma repository implementations are being built incrementally.
 * Until all implementations are ready, this factory throws at call time.
 * Use `createInMemoryRepositories()` for development and testing.
 */
export function createPrismaRepositories(_prisma: PrismaClient): Repositories {
  throw new Error(
    'Prisma repositories not yet fully implemented — use createInMemoryRepositories() for development'
  );
}

export { PrismaTeamRepository } from './team.repository';
export { PrismaTeamMemberRepository } from './team-member.repository';
export { PrismaAuditLogRepository } from './audit-log.repository';
export { PrismaSessionAggregateRepository } from './session-aggregate.repository';
export { PrismaSessionRepository } from './session.repository';
export { PrismaResponseRepository } from './response.repository';
export { PrismaSessionLinkRepository } from './session-link.repository';
export { PrismaMagicLinkRepository } from './magic-link.repository';
export { PrismaPairingCodeRepository } from './pairing-code.repository';
export { PrismaUserSessionRepository } from './user-session.repository';
export { PrismaPendingGenesisRepository } from './pending-genesis.repository';
