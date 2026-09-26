/**
 * Domain entity types for the repository layer.
 * These are plain TypeScript interfaces decoupled from Prisma.
 * Requirements: 1.1, 1.3, 3.2, 10.1
 */

export interface Team {
  id: string;
  name: string;
  description: string | null;
  privacyMode: string;
  archived: boolean;
  slackDeliveryStart: string | null;
  slackDeliveryEnd: string | null;
  timezone: string;
  /** Configurable recipient for pre-session notifications: 'delivery_manager' (default) or 'channel'. Requirement 12.4 */
  preSessionRecipient: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  name: string;
  email: string | null;
  cadencePreference: string;
  remindersEnabled: boolean;
  /** Null means unchosen — the effective answer is derived from the Slack link. */
  emailPromptsEnabled: boolean | null;
  currentStreak: number;
  bestStreak: number;
  lastStreakSessionClose: Date | null;
  createdAt: Date;
}

export interface TeamMemberRole {
  id: string;
  memberId: string;
  teamId: string;
  role: string;
  assignedAt: Date;
}

export interface HealthCheckSession {
  id: string;
  teamId: string;
  status: string;
  scheduledOpenAt: Date | null;
  scheduledCloseAt: Date | null;
  actualOpenAt: Date;
  actualCloseAt: Date | null;
  /** When aggregates were computed. Null means never — not the same as computed-and-empty. */
  materialisedAt: Date | null;
  createdAt: Date;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
}

export interface Response {
  id: string;
  memberId: string;
  sessionId: string;
  questionId: string;
  score: number;
  trendIndicator: string | null;
  submittedAt: Date;
  updatedAt: Date;
  /**
   * Set when the member marks their answers for the session final, or when the
   * session closes. Null while the answer can still be changed, and a response
   * that can still be changed is not counted towards the rolling average
   * (Requirements 16.1, 18.2, 18.4).
   */
  finalisedAt: Date | null;
}

export interface SessionLink {
  id: string;
  token: string;
  memberId: string;
  sessionId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface MagicLink {
  id: string;
  token: string;
  memberId: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface PairingCode {
  id: string;
  code: string;
  slackUserId: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionAggregate {
  id: string;
  sessionId: string;
  questionId: string;
  averageScore: number;
  responseCount: number;
  improvingCount: number;
  stableCount: number;
  decliningCount: number;
  materialisedAt: Date;
}

export interface Availability {
  id: string;
  memberId: string;
  awayFrom: Date;
  awayUntil: Date;
  createdAt: Date;
}

export interface AuditLogEntry {
  id: string;
  teamId: string;
  changeType: string;
  previousValue: string;
  newValue: string;
  userId: string;
  timestamp: Date;
}

export interface UserSession {
  id: string;
  memberId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface PendingGenesis {
  id: string;
  token: string;
  email: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

/** Requirement 3.1: Team schedule configuration */
export interface TeamSchedule {
  id: string;
  teamId: string;
  cadence: string;
  openDay: number;
  openTime: string;
  closeDay: number;
  closeTime: string;
  timezone: string;
  createdAt: Date;
}

/** Requirement 7.1: Slack identity persistence */
export interface SlackIdentityLink {
  id: string;
  memberId: string;
  slackUserId: string;
  createdAt: Date;
}

/** Requirements 13.8, 13.10: one notification of a given type per member per session */
export interface NotificationDelivery {
  id: string;
  memberId: string;
  sessionId: string;
  type: string;
  sentAt: Date;
}

/** Requirements: 5.12, NFR 1.2 — Slack interaction retry queue */
export interface SlackInteractionQueue {
  id: string;
  interactionPayload: string;
  responseUrl: string;
  failureReason: string | null;
  retryCount: number;
  status: string;
  createdAt: Date;
  nextRetryAt: Date | null;
}

/**
 * Proof that the scheduler ran, whether or not it did anything.
 *
 * Requirements: Remembering What Happened 1.1, 1.3
 *
 * No member id, deliberately, and no answer content — this is counts, a tick
 * id, and the sentence the tick already composed for its own response.
 */
export interface SchedulerHeartbeat {
  tickId: string;
  ranAt: Date;
  summary: string;
  opened: number;
  closed: number;
  materialised: number;
  prompts: number;
  durationMs: number;
}

/**
 * A tick that did something, kept past the platform's retention.
 *
 * Requirements: Remembering What Happened 2.4, 4.1, 4.3
 *
 * No member id: counts say a tick prompted somebody, and which member is the
 * delivery record's job. Keeping it out means the ledger is untouched by a
 * member's right to have their data deleted.
 */
export interface SchedulerTickRecord {
  tickId: string;
  ranAt: Date;
  summary: string;
  opened: number;
  closed: number;
  materialised: number;
  prompts: number;
  failures: number;
  durationMs: number;
  /** Skip reasons and their counts. */
  reasons: Record<string, number>;
}
