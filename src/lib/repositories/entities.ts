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
