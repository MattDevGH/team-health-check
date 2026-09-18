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
  NotificationDeliveryRepository,
  SessionLinkRepository,
} from '@/lib/repositories/types';
import type { HealthCheckSession, Team } from '@/lib/repositories/entities';
import type { EmailService } from '@/lib/services/email.service';
import { recorder as defaultRecorder, type Recorder } from '@/lib/observability';
import { getLocalDayAndTime, isWithinTimeWindow } from '@/lib/local-time';
import { wantsEmailPrompts } from '@/lib/services/email-prompt-preference';

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
  /**
   * Durable once-per-session guard. Omitted only by focused tests that do not
   * exercise repeat delivery; production wiring always injects it.
   */
  notificationDeliveryRepo?: NotificationDeliveryRepository;
  /**
   * Requirements: Reaching Your Health Check 3.1, 3.2
   *
   * The three below are what a second channel needs, and all three are
   * optional: a deployment with no email configured still prompts by Slack,
   * which is the arrangement every deployment had before this existed.
   */
  sessionLinkRepo?: SessionLinkRepository;
  emailService?: EmailService;
  baseUrl?: string;
  recorder?: Recorder;
  now?: () => Date;
}

/** Requirement 13.2: closing reminders default to 24 hours before close. */
export const DEFAULT_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/** What reached a member when a check opened. */
export interface PromptOutcome {
  slack: boolean;
  email: boolean;
}

export interface NotificationService {
  sendSlackPrompt(memberId: string, session: HealthCheckSession): Promise<boolean>;
  /**
   * Tell a member by email, with their own session link.
   *
   * Requirements: Reaching Your Health Check 3.1, 3.5, NFR 2.2
   */
  sendEmailPrompt(memberId: string, session: HealthCheckSession): Promise<boolean>;
  /**
   * Every channel the member is eligible for, and one failing does not stop
   * the other.
   *
   * Requirements: Reaching Your Health Check 3.2, 3.4
   */
  promptByEveryChannel(memberId: string, session: HealthCheckSession): Promise<PromptOutcome>;
  sendClosingReminder(memberId: string, session: HealthCheckSession): Promise<boolean>;
  /**
   * Reminds every eligible member when the session is inside its closing window.
   * Returns how many reminders were sent.
   */
  sendDueClosingReminders(
    session: HealthCheckSession,
    leadTimeMs?: number,
  ): Promise<number>;
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
    notificationDeliveryRepo,
    sessionLinkRepo,
    emailService,
  } = deps;
  const now = deps.now ?? (() => new Date());
  const baseUrl = deps.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const record = deps.recorder ?? defaultRecorder;

  /**
   * Claims the single allowed delivery of `type` for this member and session.
   * Returns false when an earlier tick already claimed it.
   * Requirements 13.8, 13.10.
   */
  async function claimDelivery(
    memberId: string,
    sessionId: string,
    type: string,
  ): Promise<boolean> {
    if (!notificationDeliveryRepo) return true;
    return notificationDeliveryRepo.claim({ memberId, sessionId, type });
  }

  /**
   * True when the team's Slack delivery window is currently open.
   * An unconfigured window imposes no restriction.
   * Requirement 5.1: prompts are only delivered inside the configured window.
   */
  function isDeliveryWindowOpen(team: Team | null, at: Date): boolean {
    if (!team?.slackDeliveryStart || !team.slackDeliveryEnd) {
      return true;
    }

    const { time } = getLocalDayAndTime(at, team.timezone || 'UTC');
    return isWithinTimeWindow(time, team.slackDeliveryStart, team.slackDeliveryEnd);
  }

  /**
   * Send a Slack prompt to a member for a session.
   * Requirement 2.8, 5.13: Only linked members receive Slack prompts.
   * Requirement 8.1: Members marked away are not prompted.
   * Requirement 5.1: Prompts are only sent inside the team's delivery window.
   *
   * These gates apply to bot-initiated prompts only — a member who runs
   * `/healthcheck` explicitly is always answered.
   */
  async function sendSlackPrompt(memberId: string, session: HealthCheckSession): Promise<boolean> {
    const hasLink = await slackLinkChecker.hasSlackLink(memberId);
    if (!hasLink) {
      return false;
    }

    const at = now();

    const awayRecord = await availabilityRepo.findActiveByMemberIdAndDate(memberId, at);
    if (awayRecord !== null) {
      return false;
    }

    const team = await teamRepo.findById(session.teamId);
    if (!isDeliveryWindowOpen(team, at)) {
      return false;
    }

    await notificationSink.send(memberId, 'slack_prompt', {
      sessionId: session.id,
      teamId: session.teamId,
    });

    return true;
  }

  /**
   * Tell a member by email, with their own session link.
   *
   * Requirements: Reaching Your Health Check 3.1, 3.5, NFR 1.1, NFR 2.2
   *
   * The same gates as Slack, deliberately. Somebody who marked themselves away
   * did so to stop being prompted, not to stop being prompted *in Slack*, and
   * a new channel that ignored the setting would quietly redefine it.
   *
   * The link is resolved from the member, never passed in. A session link
   * authenticates whoever holds it, so sending the wrong one would be handing
   * somebody another member's identity.
   */
  async function sendEmailPrompt(
    memberId: string,
    session: HealthCheckSession,
  ): Promise<boolean> {
    if (!emailService || !sessionLinkRepo) return false;

    const member = await teamMemberRepo.findById(memberId);
    // No address is not a failure — plenty of members are Slack-only
    if (!member?.email) return false;

    /*
     * Requirements 4.1, 4.3, 5.2. The member decides, and where they have not,
     * the Slack link decides for them.
     *
     * Asked here rather than by the caller so that no future caller can forget
     * it. Phase 2 emailed everybody with an address, which was right for a team
     * with no Slack and told everybody else twice.
     */
    const hasSlackLink = await slackLinkChecker.hasSlackLink(memberId);
    if (!wantsEmailPrompts({ preference: member.emailPromptsEnabled, hasSlackLink })) {
      return false;
    }

    const at = now();

    const awayRecord = await availabilityRepo.findActiveByMemberIdAndDate(memberId, at);
    if (awayRecord !== null) return false;

    const team = await teamRepo.findById(session.teamId);
    if (!isDeliveryWindowOpen(team, at)) return false;

    const link = await sessionLinkRepo.findByMemberAndSession(memberId, session.id);
    // Requirement 2.3: say nothing rather than fall back to another member's
    if (!link) return false;

    /*
     * Claimed under its own type. One claim shared with Slack would mean a
     * member with Slack never receiving the email, and a member whose Slack
     * failed receiving neither.
     */
    if (!(await claimDelivery(memberId, session.id, 'email_prompt'))) return false;

    await emailService.sendHealthCheckPrompt(
      member.email,
      link.token,
      baseUrl,
      session.scheduledCloseAt ?? null,
    );

    return true;
  }

  /**
   * Every channel the member is eligible for.
   *
   * Requirements: Reaching Your Health Check 3.2, 3.4, NFR 2.1
   *
   * Each channel is attempted independently and a failure in one is recorded
   * rather than thrown: a Resend outage that stopped Slack prompts would be a
   * worse system than the one that had no email at all.
   */
  async function promptByEveryChannel(
    memberId: string,
    session: HealthCheckSession,
  ): Promise<PromptOutcome> {
    const [slack, email] = await Promise.all([
      attempt('slack_prompt', () => sendSlackPrompt(memberId, session), memberId),
      attempt('email_prompt', () => sendEmailPrompt(memberId, session), memberId),
    ]);

    return { slack, email };
  }

  /** Runs one channel, turning a throw into a recorded false. */
  async function attempt(
    channel: string,
    send: () => Promise<boolean>,
    memberId: string,
  ): Promise<boolean> {
    try {
      return await send();
    } catch (error: unknown) {
      /*
       * NFR 2.1. The magic-link path swallowed its failures and nobody could
       * say why a colleague never heard anything. Ids and a reason only —
       * never the address or the token.
       */
      record.error(`notification.${channel}.failed`, {
        memberId,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
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
    const awayRecord = await availabilityRepo.findActiveByMemberIdAndDate(memberId, now());
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

    // Claim last, so an ineligible member never consumes their single slot
    // and can still be reminded if they become eligible on a later tick.
    if (!(await claimDelivery(memberId, session.id, 'closing_reminder'))) {
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
   * Reminds every eligible member of a session whose close is within the lead
   * window. Idempotent across ticks: the per-member claim in sendClosingReminder
   * means a member is reminded at most once per session.
   * Requirement 13.2: configurable lead time, defaulting to 24 hours.
   */
  async function sendDueClosingReminders(
    session: HealthCheckSession,
    leadTimeMs: number = DEFAULT_REMINDER_LEAD_MS,
  ): Promise<number> {
    if (!session.scheduledCloseAt) {
      // No scheduled close means no lead time can be derived
      return 0;
    }

    const at = now().getTime();
    const closesAt = session.scheduledCloseAt.getTime();
    const isDue = at >= closesAt - leadTimeMs && at < closesAt;
    if (!isDue) {
      return 0;
    }

    const members = await teamMemberRepo.findByTeamId(session.teamId);
    let sent = 0;
    for (const member of members) {
      if (await sendClosingReminder(member.id, session)) {
        sent++;
      }
    }

    return sent;
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

    // Requirement 13.1: respect the member's reminder preference.
    // Requirement 13.6: nudges target weekly-mode members; micro-pulse members
    // already receive a prompt every day.
    const member = await teamMemberRepo.findById(memberId);
    if (!member || !member.remindersEnabled || member.cadencePreference !== 'weekly') {
      return false;
    }

    // Requirement 13.6: not currently marked away
    const awayNow = await availabilityRepo.findActiveByMemberIdAndDate(memberId, now());
    if (awayNow !== null) {
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

    // Requirement 13.7: a member who was away during the previous session was
    // never expected to respond, so their silence is not a missed session.
    if (await wasAwayDuring(memberId, previousSession)) {
      return false;
    }

    // Requirement 13.8: at most one nudge per session per member
    if (!(await claimDelivery(memberId, session.id, 'mid_session_nudge'))) {
      return false;
    }

    await notificationSink.send(memberId, 'mid_session_nudge', {
      sessionId: session.id,
      teamId: session.teamId,
      previousSessionId: previousSession.id,
    });

    return true;
  }

  /**
   * Whether the member was marked away while the given session ran.
   * Probes the session's open and close instants, the two points the
   * availability repository can answer for directly.
   */
  async function wasAwayDuring(
    memberId: string,
    session: HealthCheckSession,
  ): Promise<boolean> {
    const probes = [session.actualOpenAt, session.actualCloseAt].filter(
      (date): date is Date => date !== null,
    );

    for (const probe of probes) {
      const away = await availabilityRepo.findActiveByMemberIdAndDate(memberId, probe);
      if (away !== null) {
        return true;
      }
    }

    return false;
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

  return {
    sendSlackPrompt,
    sendEmailPrompt,
    promptByEveryChannel,
    sendClosingReminder,
    sendDueClosingReminders,
    sendMidSessionNudge,
    sendPreSessionNotification,
  };
}
