/**
 * Production service container.
 * Wires repository instances to service factories.
 * Route handlers import configured service instances from here.
 *
 * Architecture: Factory injection — no DI container, just explicit wiring.
 */

import { createTeamService } from './services/team.service';
import { createSessionService } from './services/session.service';
import { createResponseService } from './services/response.service';
import { createAuthService } from './services/auth.service';
import { createTrendService } from './services/trend.service';
import { createRoleService } from './services/role.service';
import { createPermissionService } from './services/permission.service';
import { createGenesisService } from './services/genesis.service';
import { createScheduleService } from './services/schedule.service';
import { createAuditService } from './services/audit.service';
import { createPrivacyService } from './services/privacy.service';
import { createAvailabilityService } from './services/availability.service';
import { createStreakService } from './services/streak.service';
import { createQuestionSelectionService } from './services/question-selection.service';
import type { Repositories } from './repositories';
import type { TeamService } from './services/team.service';
import type { SessionService } from './services/session.service';
import type { ResponseService } from './services/response.service';
import type { AuthService } from './services/auth.service';
import type { RoleService } from './services/role.service';
import type { PermissionService } from './services/permission.service';
import type { AuditService } from './services/audit.service';
import type { PrivacyService } from './services/privacy.service';
import type { AvailabilityService } from './services/availability.service';
import type { StreakService } from './services/streak.service';
import type { QuestionSelectionService } from './services/question-selection.service';

/** Typed container exposing all wired service instances */
export interface Container {
  team: TeamService;
  session: SessionService;
  response: ResponseService;
  auth: AuthService;
  role: RoleService;
  permission: PermissionService;
  genesis: ReturnType<typeof createGenesisService>;
  trend: ReturnType<typeof createTrendService>;
  schedule: ReturnType<typeof createScheduleService>;
  auditLog: AuditService;
  privacy: PrivacyService;
  availability: AvailabilityService;
  streak: StreakService;
  questionSelection: QuestionSelectionService;
}

/**
 * Creates the production service container from a set of repositories.
 * NotificationService and SchedulerService require additional dependencies
 * (sinks, other services) and are wired separately at the route handler level.
 */
export function createContainer(repos: Repositories): Container {
  const auditLog = createAuditService({ auditLogRepo: repos.auditLog });

  const team = createTeamService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    teamMemberRoleRepo: repos.teamMemberRole,
    auditLogRepo: repos.auditLog,
    sessionRepo: repos.session,
  });

  const role = createRoleService({
    teamMemberRoleRepo: repos.teamMemberRole,
    auditLogRepo: repos.auditLog,
  });

  const permission = createPermissionService({
    teamMemberRoleRepo: repos.teamMemberRole,
  });

  const session = createSessionService({
    sessionRepo: repos.session,
    sessionLinkRepo: repos.sessionLink,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    sessionAggregateRepo: repos.sessionAggregate,
  });

  const response = createResponseService({
    responseRepo: repos.response,
    sessionRepo: repos.session,
    teamMemberRepo: repos.teamMember,
    auditLogRepo: repos.auditLog,
  });

  const auth = createAuthService({
    pairingCodeRepo: repos.pairingCode,
    magicLinkRepo: repos.magicLink,
    teamMemberRepo: repos.teamMember,
    userSessionRepo: repos.userSession,
    pendingGenesisRepo: repos.pendingGenesis,
    sessionLinkRepo: repos.sessionLink,
    sessionRepo: repos.session,
  });

  const genesis = createGenesisService({
    pendingGenesisRepo: repos.pendingGenesis,
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    teamMemberRoleRepo: repos.teamMemberRole,
    userSessionRepo: repos.userSession,
  });

  const trend = createTrendService({
    sessionAggregateRepo: repos.sessionAggregate,
    sessionRepo: repos.session,
    teamRepo: repos.team,
  });

  const privacy = createPrivacyService({
    teamRepo: repos.team,
    auditLogRepo: repos.auditLog,
  });

  const availability = createAvailabilityService({
    availabilityRepo: repos.availability,
  });

  const streak = createStreakService({
    sessionRepo: repos.session,
    responseRepo: repos.response,
    availabilityRepo: repos.availability,
    teamMemberRepo: repos.teamMember,
  });

  const schedule = createScheduleService({
    teamScheduleRepo: repos.teamSchedule,
  });

  const questionSelection = createQuestionSelectionService({
    questionRepo: repos.question,
    responseRepo: repos.response,
    sessionRepo: repos.session,
  });

  return {
    team,
    session,
    response,
    auth,
    role,
    permission,
    genesis,
    trend,
    schedule,
    auditLog,
    privacy,
    availability,
    streak,
    questionSelection,
  };
}
