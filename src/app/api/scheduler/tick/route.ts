/**
 * POST /api/scheduler/tick
 * Cron-triggered route that drives session lifecycle via desired-state reconciliation.
 * Authenticates via CRON_SECRET in Authorization header.
 *
 * Requirements: 3.2, 3.3
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ForbiddenError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { createSchedulerService } from '@/lib/services/scheduler.service';
import { createSessionService } from '@/lib/services/session.service';
import { PrismaTeamRepository } from '@/lib/repositories/prisma/team.repository';
import { PrismaSessionRepository } from '@/lib/repositories/prisma/session.repository';
import { PrismaSessionAggregateRepository } from '@/lib/repositories/prisma/session-aggregate.repository';
import { PrismaSessionLinkRepository } from '@/lib/repositories/prisma/session-link.repository';
import { PrismaTeamMemberRepository } from '@/lib/repositories/prisma/team-member.repository';
import { PrismaResponseRepository } from '@/lib/repositories/prisma/response.repository';
import { PrismaTeamScheduleRepository } from '@/lib/repositories/prisma/team-schedule.repository';

export const POST = withErrorHandling(async (request: Request) => {
  // 1. Authenticate via CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ForbiddenError('Invalid or missing CRON_SECRET');
  }

  // 2. Wire repositories and services for the scheduler
  const teamRepo = new PrismaTeamRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const sessionAggregateRepo = new PrismaSessionAggregateRepository(prisma);
  const sessionLinkRepo = new PrismaSessionLinkRepository(prisma);
  const teamMemberRepo = new PrismaTeamMemberRepository(prisma);
  const responseRepo = new PrismaResponseRepository(prisma);
  const teamScheduleRepo = new PrismaTeamScheduleRepository(prisma);

  const sessionService = createSessionService({
    sessionRepo,
    sessionLinkRepo,
    teamMemberRepo,
    responseRepo,
    sessionAggregateRepo,
  });

  const scheduler = createSchedulerService({
    teamRepo,
    teamScheduleRepo,
    sessionRepo,
    sessionAggregateRepo,
    sessionService,
  });

  // 3. Execute tick with current time
  await scheduler.tick(new Date());

  return Response.json({ ok: true });
});
