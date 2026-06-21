/**
 * Notification service for Slack prompts, closing reminders, and mid-session nudges.
 * Determines WHO should receive notifications and records the intent via a NotificationSink.
 * Actual delivery (Slack API calls) is handled by a separate delivery layer.
 * Requirements: 2.8, 5.2, 5.13, 13.1, 13.2, 13.3, 13.6, 13.8
 */

import type {
  TeamRepository,
  TeamMemberRepository,
  ResponseRepository,
  QuestionRepository,
  AvailabilityRepository,
  SessionRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession } from '@/lib/repositories/entities';

/** Injectable sink that captures notification intents for delivery */
export interface NotificationSink {
  send(memberId: string, type: string, payload: unknown): Promise<void>;
}

/** Injectable checker for Slack identity link status */
export interface SlackLinkChecker {
  hasSlackLink(memberId: string): Promise<boolean>;
}

export interface NotificationServiceDeps {
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  responseRepo: ResponseRepository;
  questionRepo: QuestionRepository;
  availabilityRepo: AvailabilityRepository;
  sessionRepo: SessionRepository;
  notificationSink: NotificationSink;
  slackLinkChecker: SlackLinkChecker;
}

export interface NotificationService {
  sendSlackPrompt(memberId: string, session: HealthCheckSession): Promise<boolean>;
  sendClosingReminder(memberId: string, session: HealthCheckSession): Promise<boolean>;
  sendMidSessionNudge(memberId: string, session: HealthCheckSession): Promise<boolean>;
  sendPreSessionNotification(teamId: string, session: HealthCheckSession): Promise<void>;
}

/**
 * Factory function for creating the notification service.
 * Requirement 2.8: Only linked members receive Slack messages.
 * Requirement 13.2: Closing reminder checks completion, away, and reminders setting.
 * Requirement 13.6: Mid-session nudge for members who missed previous session.
 * Requirement 13.8: Max one nudge per session per member.
 */
export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const {
    teamRepo,
    teamMemberRepo,
    responseRepo,
    questionRepo,
    availabilityRepo,
    sessionRepo,
    notificationSink,
    slackLinkChecker,
  } = deps;

  // Track nudges sent per session to enforce max-once-per-session rule (Requirement 13.8)
  const nudgesSent = new Map<string, Set<string>>();

  /**
   * Send a Slack prompt to a member for a session.
   * Only sends to members with a linked Slack identity.
   * Requirement 2.8, 5.13: Only linked members receive Slack prompts.
   */
  async function sendSlackPrompt(memberId: string, session: HealthCheckSession): Promise<boolean> {
    const hasLink = await slackLinkChecker.hasSlackLink(memberId);
    if (!hasLink) {
      return false;
    }

    await notificationSink.send(memberId, 'slack_prompt', {
      sessionId: session.id,
      teamId: session.teamId,
    });

    return true;
  }

  /**
   * Send a closing reminder to a member.
   * Requirement 13.2: Only sends if member hasn't completed all questions, not away, reminders enabled.
   * Requirement 13.3: Skip members who completed all questions.
   */
  async function sendClosingReminder(memberId: string, session: HealthCheckSession): Promise<boolean> {
    // Check Slack link
    const hasLink = await slackLinkChecker.hasSlackLink(memberId);
    if (!hasLink) {
      return false;
    }

    // Check reminders enabled
    const member = await teamMemberRepo.findById(memberId);
    if (!member || !member.remindersEnabled) {
      return false;
    }

    // Check not away
    const awayRecord = await availabilityRepo.findActiveByMemberIdAndDate(memberId, new Date());
    if (awayRecord !== null) {
      return false;
    }

    // Check if member has completed all questions
    const questions = await questionRepo.findAll();
    const responses = await responseRepo.findByMemberAndSession(memberId, session.id);
    const answeredQuestionIds = new Set(responses.map(r => r.questionId));
    const allCompleted = questions.every(q => answeredQuestionIds.has(q.id));

    if (allCompleted) {
      return false;
    }

    await notificationSink.send(memberId, 'closing_reminder', {
      sessionId: session.id,
      teamId: session.teamId,
      unansweredCount: questions.length - answeredQuestionIds.size,
    });

    return true;
  }

  /**
   * Send a mid-session nudge to a member who missed the previous session.
   * Requirement 13.6: Only if member didn't respond in previous closed session.
   * Requirement 13.8: Max once per session per member.
   */
  async function sendMidSessionNudge(memberId: string, session: HealthCheckSession): Promise<boolean> {
    // Check Slack link
    const hasLink = await slackLinkChecker.hasSlackLink(memberId);
    if (!hasLink) {
      return false;
    }

    // Check max once per session (Requirement 13.8)
    const sessionNudges = nudgesSent.get(session.id) ?? new Set<string>();
    if (sessionNudges.has(memberId)) {
      return false;
    }

    // Find previous closed session for this team
    const teamSessions = await sessionRepo.findByTeamId(session.teamId);
    const closedSessions = teamSessions
      .filter(s => s.status === 'closed' && s.id !== session.id)
      .sort((a, b) => {
        const aClose = a.actualCloseAt?.getTime() ?? a.createdAt.getTime();
        const bClose = b.actualCloseAt?.getTime() ?? b.createdAt.getTime();
        return bClose - aClose;
      });

    if (closedSessions.length === 0) {
      // No previous session — no nudge needed
      return false;
    }

    const previousSession = closedSessions[0];

    // Check if member responded in the previous session
    const previousResponses = await responseRepo.findByMemberAndSession(memberId, previousSession.id);
    if (previousResponses.length > 0) {
      // Member did respond in previous session — no nudge
      return false;
    }

    // Send nudge
    await notificationSink.send(memberId, 'mid_session_nudge', {
      sessionId: session.id,
      teamId: session.teamId,
      previousSessionId: previousSession.id,
    });

    // Record that nudge was sent for this session
    sessionNudges.add(memberId);
    nudgesSent.set(session.id, sessionNudges);

    return true;
  }

  /**
   * Send a pre-session notification listing expected participants and away members.
   * Requirement 12.3: Sends before a scheduled session opens.
   * Requirement 12.4: Configurable recipient (delivery_manager DM or team channel).
   */
  async function sendPreSessionNotification(teamId: string, session: HealthCheckSession): Promise<void> {
    // 1. Get team configuration for recipient preference
    const team = await teamRepo.findById(teamId);
    const recipient = team?.preSessionRecipient ?? 'delivery_manager';

    // 2. Get all team members
    const members = await teamMemberRepo.findByTeamId(teamId);

    // 3. For each member, check if they are away during the session
    const sessionDate = session.scheduledOpenAt ?? session.actualOpenAt;
    const expectedParticipants: Array<{ id: string; name: string }> = [];
    const awayMembers: Array<{ id: string; name: string }> = [];

    for (const member of members) {
      const awayRecord = await availabilityRepo.findActiveByMemberIdAndDate(member.id, sessionDate);
      if (awayRecord !== null) {
        awayMembers.push({ id: member.id, name: member.name });
      } else {
        expectedParticipants.push({ id: member.id, name: member.name });
      }
    }

    // 4. Send notification with the lists (via notification sink)
    await notificationSink.send(teamId, 'pre_session_notification', {
      sessionId: session.id,
      teamId,
      recipient,
      expectedParticipants,
      awayMembers,
    });
  }

  return { sendSlackPrompt, sendClosingReminder, sendMidSessionNudge, sendPreSessionNotification };
}
