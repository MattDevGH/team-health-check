/**
 * POST /api/scheduler/tick
 * Cron-triggered route that drives session lifecycle via desired-state reconciliation.
 * Authenticates via CRON_SECRET in Authorization header.
 *
 * After opening sessions, sends Slack prompts to eligible members via NotificationService.
 *
 * Requirements: 3.2, 3.3, 8.1, 8.2, 8.3
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ForbiddenError } from '@/lib/errors';
import { container, repos } from '@/lib/container-production';
import { createSchedulerService } from '@/lib/services/scheduler.service';
import {
  createNotificationService,
  DEFAULT_REMINDER_LEAD_MS,
} from '@/lib/services/notification.service';
import { createProductionNotificationSink } from '@/lib/slack/production-notification-sink';
import { createProductionSlackLinkChecker } from '@/lib/slack/production-slack-link-checker';
import { createSlackApiClient } from '@/lib/slack/delivery';
import { InMemoryInteractionQueueRepository } from '@/lib/repositories/in-memory/interaction-queue.repository';
import type { NotificationSink } from '@/lib/services/notification.service';

/**
 * Test seam: lets route tests drive the exported handler with a recording sink
 * and a fixed clock, instead of reproducing this orchestration in the test.
 */
interface TickTestDeps {
  notificationSink?: NotificationSink;
  now?: () => Date;
}

let _testDeps: TickTestDeps = {};

export function _setTickTestDeps(deps: TickTestDeps): void {
  _testDeps = deps;
}

export function _resetTickTestDeps(): void {
  _testDeps = {};
}

/**
 * Closing-reminder lead time, configurable via CLOSING_REMINDER_LEAD_HOURS.
 * Requirement 13.2: defaults to 24 hours.
 */
function reminderLeadMs(): number {
  const configured = Number(process.env.CLOSING_REMINDER_LEAD_HOURS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_REMINDER_LEAD_MS;
  }
  return configured * 60 * 60 * 1000;
}

export const POST = withErrorHandling(async (request: Request) => {
  // 1. Authenticate via CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ForbiddenError('Invalid or missing CRON_SECRET');
  }

  // 2. Wire the scheduler service (requires session service + repos not in container)
  const scheduler = createSchedulerService({
    teamRepo: repos.team,
    teamScheduleRepo: repos.teamSchedule,
    sessionRepo: repos.session,
    sessionAggregateRepo: repos.sessionAggregate,
    sessionService: container.session,
  });

  // 3. Snapshot open sessions before tick (to detect newly opened ones)
  const now = _testDeps.now?.() ?? new Date();
  const teams = await repos.team.list();
  const openSessionsBefore = new Map<string, string>();
  for (const team of teams) {
    if (team.archived) continue;
    const openSession = await repos.session.findOpenByTeamId(team.id);
    if (openSession) {
      openSessionsBefore.set(team.id, openSession.id);
    }
  }

  // 4. Execute tick
  await scheduler.tick(now);

  // 5. Wire NotificationService with production sink and link checker
  const slackLinkChecker = createProductionSlackLinkChecker({
    slackIdentityLinkRepo: repos.slackIdentityLink,
  });

  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const notificationSink = _testDeps.notificationSink
    ?? (slackBotToken
    ? createProductionNotificationSink({
        slackClient: createSlackApiClient(slackBotToken),
        slackIdentityLinkRepo: repos.slackIdentityLink,
        slackInteractionQueueRepo: new InMemoryInteractionQueueRepository(),
        questionRepo: repos.question,
        sessionLinkRepo: repos.sessionLink,
      })
      : { send: async () => {} }); // No-op sink if no Slack token configured

  const notificationService = createNotificationService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    questionRepo: repos.question,
    availabilityRepo: repos.availability,
    sessionRepo: repos.session,
    notificationDeliveryRepo: repos.notificationDelivery,
    notificationSink,
    slackLinkChecker,
    now: () => now,
  });

  // 6. Notify for open sessions (Requirements 8.1, 8.2).
  // NotificationService owns eligibility: Slack link, availability, delivery
  // window, reminder preference, completion, and the once-per-session guard.
  for (const team of teams) {
    if (team.archived) continue;

    const openSession = await repos.session.findOpenByTeamId(team.id);
    if (!openSession) continue;

    if (!openSessionsBefore.has(team.id)) {
      // Session was just opened — prompt eligible members
      const members = await repos.teamMember.findByTeamId(team.id);
      for (const member of members) {
        await notificationService.sendSlackPrompt(member.id, openSession);
      }
    }

    // Remind members whose session is approaching its close
    await notificationService.sendDueClosingReminders(openSession, reminderLeadMs());
  }

  return Response.json({ ok: true });
});
