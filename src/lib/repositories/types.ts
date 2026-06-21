/**
 * Repository interfaces for the data access layer.
 * Services depend on these interfaces, never on Prisma directly.
 * Requirements: 1.1, 1.3, 3.2, 10.1
 */

import type {
  Team,
  TeamMember,
  TeamMemberRole,
  HealthCheckSession,
  Question,
  Response,
  SessionLink,
  MagicLink,
  PairingCode,
  SessionAggregate,
  Availability,
  AuditLogEntry,
  UserSession,
  PendingGenesis,
  TeamSchedule,
} from './entities';

/** Requirement 1.1: Team creation and management */
export interface TeamRepository {
  create(data: { name: string; description?: string; privacyMode?: string; timezone?: string }): Promise<Team>;
  findById(id: string): Promise<Team | null>;
  update(id: string, data: Partial<Pick<Team, 'name' | 'description' | 'privacyMode' | 'archived' | 'slackDeliveryStart' | 'slackDeliveryEnd' | 'timezone' | 'preSessionRecipient'>>): Promise<Team>;
  list(): Promise<Team[]>;
}

/** Requirement 1.3: Team member management */
export interface TeamMemberRepository {
  create(data: { id?: string; teamId: string; name: string; email?: string }): Promise<TeamMember>;
  findById(id: string): Promise<TeamMember | null>;
  findByTeamId(teamId: string): Promise<TeamMember[]>;
  findByTeamAndNameEmail(teamId: string, name: string, email?: string): Promise<TeamMember | null>;
  findByEmail(email: string): Promise<TeamMember | null>;
  update(id: string, data: Partial<Pick<TeamMember, 'name' | 'email' | 'cadencePreference' | 'remindersEnabled' | 'currentStreak' | 'bestStreak' | 'lastStreakSessionClose'>>): Promise<TeamMember>;
  remove(id: string): Promise<void>;
}

/** Requirement 3.2: Session lifecycle */
export interface SessionRepository {
  create(data: { teamId: string; status: string; scheduledOpenAt?: Date; scheduledCloseAt?: Date }): Promise<HealthCheckSession>;
  findById(id: string): Promise<HealthCheckSession | null>;
  findOpenByTeamId(teamId: string): Promise<HealthCheckSession | null>;
  findByTeamId(teamId: string): Promise<HealthCheckSession[]>;
  update(id: string, data: Partial<Pick<HealthCheckSession, 'status' | 'actualCloseAt'>>): Promise<HealthCheckSession>;
}

/** Requirement 10.1: Response data integrity */
export interface ResponseRepository {
  upsert(data: { memberId: string; sessionId: string; questionId: string; score: number; trendIndicator?: string }): Promise<Response>;
  findByMemberAndSession(memberId: string, sessionId: string): Promise<Response[]>;
  findBySession(sessionId: string): Promise<Response[]>;
  findRecentByTeamAndQuestion(teamId: string, questionId: string, count: number): Promise<Response[]>;
  deleteByMemberId(memberId: string): Promise<number>;
  countBySessionAndQuestion(sessionId: string, questionId: string): Promise<number>;
}

/** Requirement 6.1: Session link generation */
export interface SessionLinkRepository {
  create(data: { token: string; memberId: string; sessionId: string; expiresAt: Date }): Promise<SessionLink>;
  findByToken(token: string): Promise<SessionLink | null>;
  findByMemberAndSession(memberId: string, sessionId: string): Promise<SessionLink | null>;
}

/** Requirement 7.2: Magic link single-use access */
export interface MagicLinkRepository {
  create(data: { token: string; memberId: string; expiresAt: Date }): Promise<MagicLink>;
  findByToken(token: string): Promise<MagicLink | null>;
  claimToken(token: string): Promise<MagicLink | null>;
}

/** Requirement 18.1: Audit log */
export interface AuditLogRepository {
  create(entry: { teamId: string; changeType: string; previousValue: string; newValue: string; userId: string }): Promise<AuditLogEntry>;
  findByTeamId(teamId: string, pagination?: { cursor?: string; limit?: number }): Promise<AuditLogEntry[]>;
}

/** Requirement 8.1: Session aggregates for trend visualisation */
export interface SessionAggregateRepository {
  create(data: { sessionId: string; questionId: string; averageScore: number; responseCount: number; improvingCount: number; stableCount: number; decliningCount: number }): Promise<SessionAggregate>;
  findBySessionId(sessionId: string): Promise<SessionAggregate[]>;
  findByTeamId(teamId: string): Promise<SessionAggregate[]>;
}

/** Requirement 9.1: Fixed question set */
export interface QuestionRepository {
  findAll(): Promise<Question[]>;
  findById(id: string): Promise<Question | null>;
}

/** Requirement 12.1: Team member availability */
export interface AvailabilityRepository {
  create(data: { memberId: string; awayFrom: Date; awayUntil: Date }): Promise<Availability>;
  findByMemberId(memberId: string): Promise<Availability[]>;
  findActiveByMemberIdAndDate(memberId: string, date: Date): Promise<Availability | null>;
  delete(id: string): Promise<void>;
}

/** Requirement 19.1: Role-based access control */
export interface TeamMemberRoleRepository {
  assign(data: { memberId: string; teamId: string; role: string }): Promise<TeamMemberRole>;
  remove(memberId: string, teamId: string, role: string): Promise<void>;
  findByMemberAndTeam(memberId: string, teamId: string): Promise<TeamMemberRole[]>;
  countByTeamAndRole(teamId: string, role: string): Promise<number>;
}

/** Requirement 2.3: Slack pairing codes */
export interface PairingCodeRepository {
  create(data: { code: string; slackUserId: string; expiresAt: Date }): Promise<PairingCode>;
  findByCode(code: string): Promise<PairingCode | null>;
  markUsed(id: string): Promise<void>;
}

/** Requirement 7.3: Authenticated user sessions */
export interface UserSessionRepository {
  create(data: { memberId: string; token: string; expiresAt: Date }): Promise<UserSession>;
  findByToken(token: string): Promise<UserSession | null>;
}

/** Requirement 7.9: Pending genesis for new team creation */
export interface PendingGenesisRepository {
  create(data: { token: string; email: string; expiresAt: Date }): Promise<PendingGenesis>;
  findByToken(token: string): Promise<PendingGenesis | null>;
  claimToken(token: string): Promise<PendingGenesis | null>;
}

/** Requirement 3.1: Team schedule configuration */
export interface TeamScheduleRepository {
  create(data: { teamId: string; cadence: string; openDay: number; openTime: string; closeDay: number; closeTime: string; timezone: string }): Promise<TeamSchedule>;
  findByTeamId(teamId: string): Promise<TeamSchedule | null>;
  update(teamId: string, data: Partial<Pick<TeamSchedule, 'cadence' | 'openDay' | 'openTime' | 'closeDay' | 'closeTime' | 'timezone'>>): Promise<TeamSchedule>;
}
