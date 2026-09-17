/**
 * A check that opens tells everybody it can reach, by every channel it can use.
 *
 * Requirements: Reaching Your Health Check 3.2, 3.4, 3.5, NFR 2.1, NFR 2.2
 * Properties: 3 (every eligible channel), 4 (one prompt per member per channel)
 *
 * The tick called `sendSlackPrompt` and nothing else, so a team without Slack
 * was never told a check had opened. Adding a second channel is the easy part;
 * the things worth testing are the ones that only show up once there are two.
 *
 * One channel failing must not take the other with it — a Resend outage that
 * stopped Slack prompts would be a worse system than the one with no email at
 * all. And the gates written for Slack have to apply to a channel that did not
 * exist when they were written, or marking yourself away stops meaning what it
 * meant.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import {
  createNotificationService,
  type NotificationService,
  type NotificationSink,
} from '@/lib/services/notification.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import { createRecorder } from '@/lib/observability';
import type { HealthCheckSession } from '@/lib/repositories/entities';

const BASE_URL = 'https://team-health-check.example';
/** Inside a Monday-to-Friday, 09:00-17:00 delivery window. */
const DURING = new Date('2026-09-16T12:00:00.000Z');

let repos: Repositories;
let email: InMemoryEmailService;
let events: Record<string, unknown>[];
let sinkCalls: Array<{ memberId: string; type: string }>;
let notifications: NotificationService;
let session: HealthCheckSession;
let teamId = '';
let memberId = '';

/** A sink that records, and can be made to fail. */
function sink(fail = false): NotificationSink {
  return {
    async send(memberId: string, type: string): Promise<void> {
      if (fail) throw new Error('slack said no');
      sinkCalls.push({ memberId, type });
    },
  };
}

function build(options: { slackFails?: boolean; emailFails?: boolean } = {}) {
  const emailService: InMemoryEmailService = options.emailFails
    ? (Object.assign(new InMemoryEmailService(), {
        sendHealthCheckPrompt: async () => {
          throw new Error('resend said no');
        },
      }) as InMemoryEmailService)
    : email;

  return createNotificationService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    questionRepo: repos.question,
    availabilityRepo: repos.availability,
    sessionRepo: repos.session,
    sessionLinkRepo: repos.sessionLink,
    notificationSink: sink(options.slackFails),
    slackLinkChecker: { hasSlackLink: async () => true },
    notificationDeliveryRepo: repos.notificationDelivery,
    emailService,
    baseUrl: BASE_URL,
    recorder: createRecorder({
      sink: { write: line => events.push(JSON.parse(line) as Record<string, unknown>) },
    }),
    now: () => DURING,
  });
}

beforeEach(async () => {
  repos = createInMemoryRepositories();
  email = new InMemoryEmailService();
  events = [];
  sinkCalls = [];

  const team = await repos.team.create({ name: 'Prompt Team', timezone: 'UTC' });
  teamId = team.id;
  const member = await repos.teamMember.create({
    teamId,
    name: 'Member',
    email: 'member@prompt.test',
  });
  memberId = member.id;
  session = await repos.session.create({ teamId, status: 'open' });
  await repos.sessionLink.create({
    token: 'session-token-1',
    memberId,
    sessionId: session.id,
    expiresAt: new Date(DURING.getTime() + 7 * 24 * 60 * 60 * 1000),
  });

  notifications = build();
});

describe('prompting by email', () => {
  it('sends to the member’s address', async () => {
    await notifications.sendEmailPrompt(memberId, session);

    expect(email.sentPrompts[0]).toMatchObject({ to: 'member@prompt.test' });
  });

  it('carries that member’s own session link, not anybody else’s', async () => {
    /*
     * NFR 1.1. A session link authenticates whoever holds it, so the one
     * thing this must never do is resolve the wrong member's.
     */
    const other = await repos.teamMember.create({
      teamId,
      name: 'Other',
      email: 'other@prompt.test',
    });
    await repos.sessionLink.create({
      token: 'session-token-other',
      memberId: other.id,
      sessionId: session.id,
      expiresAt: new Date(DURING.getTime() + 1000),
    });

    await notifications.sendEmailPrompt(memberId, session);

    expect(email.sentPrompts[0].token).toBe('session-token-1');
  });

  it('sends nothing when the member has no link for this check', async () => {
    // Requirement 2.3: say nothing rather than fall back to another member's
    const linkless = await repos.teamMember.create({
      teamId,
      name: 'Linkless',
      email: 'linkless@prompt.test',
    });

    await expect(notifications.sendEmailPrompt(linkless.id, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });

  it('sends nothing when the member has no address', async () => {
    const anonymous = await repos.teamMember.create({ teamId, name: 'No Address' });
    await repos.sessionLink.create({
      token: 'session-token-anon',
      memberId: anonymous.id,
      sessionId: session.id,
      expiresAt: new Date(DURING.getTime() + 1000),
    });

    await expect(notifications.sendEmailPrompt(anonymous.id, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });
});

describe('the gates written for Slack apply to email too', () => {
  it('does not prompt a member who is away', async () => {
    /*
     * Requirement 3.5. Somebody who marked themselves away did so to stop
     * being prompted, not to stop being prompted *in Slack* — a new channel
     * that ignored it would quietly redefine what the setting means.
     */
    await repos.availability.create({
      memberId,
      awayFrom: new Date('2026-09-15T00:00:00.000Z'),
      awayUntil: new Date('2026-09-20T00:00:00.000Z'),
    });

    await expect(notifications.sendEmailPrompt(memberId, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });

  it('does not prompt outside the team’s delivery window', async () => {
    await repos.team.update(teamId, {
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '10:00',
    });

    await expect(notifications.sendEmailPrompt(memberId, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });

  it('prompts inside it', async () => {
    await repos.team.update(teamId, {
      slackDeliveryStart: '09:00',
      slackDeliveryEnd: '17:00',
    });

    await expect(notifications.sendEmailPrompt(memberId, session)).resolves.toBe(true);
  });
});

describe('once per member per check per channel', () => {
  it('does not prompt the same member twice by email', async () => {
    // Property 4, through the existing NotificationDelivery claim
    await notifications.sendEmailPrompt(memberId, session);
    await notifications.sendEmailPrompt(memberId, session);

    expect(email.sentPrompts).toHaveLength(1);
  });

  it('counts email and Slack separately, since they are different messages', async () => {
    /*
     * One claim for both would mean a member with Slack never receiving the
     * email, and a member whose Slack failed never receiving either.
     */
    await notifications.sendEmailPrompt(memberId, session);
    await notifications.sendSlackPrompt(memberId, session);

    expect(email.sentPrompts).toHaveLength(1);
    expect(sinkCalls).toHaveLength(1);
  });
});

describe('one channel failing does not take the other with it', () => {
  it('still sends Slack when email throws', async () => {
    /*
     * Requirement 3.4. A Resend outage that stopped Slack prompts would be a
     * worse system than the one that had no email at all.
     */
    notifications = build({ emailFails: true });

    const result = await notifications.promptByEveryChannel(memberId, session);

    expect(result.slack).toBe(true);
    expect(sinkCalls).toHaveLength(1);
  });

  it('still sends email when Slack throws', async () => {
    notifications = build({ slackFails: true });

    const result = await notifications.promptByEveryChannel(memberId, session);

    expect(result.email).toBe(true);
    expect(email.sentPrompts).toHaveLength(1);
  });

  it('reports a failure rather than swallowing it', async () => {
    // NFR 2.1. The magic-link path failed this standard and nobody could say
    // why a colleague never heard anything
    notifications = build({ emailFails: true });

    await notifications.promptByEveryChannel(memberId, session);

    expect(events.some(e => e.event === 'notification.email_prompt.failed')).toBe(true);
  });

  it('puts no address or token in the failure record', async () => {
    notifications = build({ emailFails: true });

    await notifications.promptByEveryChannel(memberId, session);

    const written = JSON.stringify(events);
    expect(written).not.toContain('member@prompt.test');
    expect(written).not.toContain('session-token-1');
  });
});

describe('delivering by every channel the member is eligible for', () => {
  it('uses both when both are available', async () => {
    // Requirement 3.2, and Property 3
    const result = await notifications.promptByEveryChannel(memberId, session);

    expect(result).toMatchObject({ slack: true, email: true });
  });

  it('uses email alone when Slack is not linked', async () => {
    /*
     * The team this spec exists for. Before it, such a member was told
     * nothing at all.
     */
    notifications = createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      notificationSink: sink(),
      slackLinkChecker: { hasSlackLink: async () => false },
      notificationDeliveryRepo: repos.notificationDelivery,
      emailService: email,
      baseUrl: BASE_URL,
      now: () => DURING,
    });

    const result = await notifications.promptByEveryChannel(memberId, session);

    expect(result).toMatchObject({ slack: false, email: true });
    expect(email.sentPrompts).toHaveLength(1);
  });

  it('uses neither for a member who is away', async () => {
    await repos.availability.create({
      memberId,
      awayFrom: new Date('2026-09-15T00:00:00.000Z'),
      awayUntil: new Date('2026-09-20T00:00:00.000Z'),
    });

    const result = await notifications.promptByEveryChannel(memberId, session);

    expect(result).toMatchObject({ slack: false, email: false });
  });
});
