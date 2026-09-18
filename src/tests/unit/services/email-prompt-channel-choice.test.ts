/**
 * The preference decides whether a prompt goes by email.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.3, 5.1, 5.2
 * Properties: 6, 7
 *
 * Phase 2 gave every member with an address an email prompt, which was right
 * for the team the milestone exists for and wrong for everybody already living
 * in Slack: they were told twice, and a tool that tells you twice is teaching
 * you to ignore it.
 *
 * This is the behaviour change that comes with phase 3, and it is worth naming
 * because it is a *reduction* in what gets sent. A member with Slack linked and
 * no preference stops receiving email prompts. Requirement 5.2 asks for exactly
 * that — Slack stays the primary route — and Requirement 4.1 lets anybody who
 * disagrees say so.
 *
 * The rule itself is tested in `email-prompt-preference.test.ts`. What is
 * tested here is that delivery actually consults it, which is a different
 * claim: a correct rule nothing calls changes nothing.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import {
  createNotificationService,
  type NotificationService,
  type NotificationSink,
} from '@/lib/services/notification.service';
import { InMemoryEmailService } from '@/lib/services/email.service';
import type { HealthCheckSession } from '@/lib/repositories/entities';

/** Inside a Monday-to-Friday, 09:00-17:00 delivery window. */
const DURING = new Date('2026-09-16T12:00:00.000Z');

let repos: Repositories;
let email: InMemoryEmailService;
let sinkCalls: Array<{ memberId: string; type: string }>;
let session: HealthCheckSession;
let teamId = '';
let memberId = '';

const sink: NotificationSink = {
  async send(memberId: string, type: string): Promise<void> {
    sinkCalls.push({ memberId, type });
  },
};

function build(hasSlackLink: boolean): NotificationService {
  return createNotificationService({
    teamRepo: repos.team,
    teamMemberRepo: repos.teamMember,
    responseRepo: repos.response,
    questionRepo: repos.question,
    availabilityRepo: repos.availability,
    sessionRepo: repos.session,
    sessionLinkRepo: repos.sessionLink,
    notificationSink: sink,
    slackLinkChecker: { hasSlackLink: async () => hasSlackLink },
    notificationDeliveryRepo: repos.notificationDelivery,
    emailService: email,
    baseUrl: 'https://team-health-check.example',
    now: () => DURING,
  });
}

/** Sets the member's stored choice. `null` puts them back to unchosen. */
async function choose(preference: boolean | null): Promise<void> {
  await repos.teamMember.update(memberId, { emailPromptsEnabled: preference });
}

beforeEach(async () => {
  repos = createInMemoryRepositories();
  email = new InMemoryEmailService();
  sinkCalls = [];

  const team = await repos.team.create({ name: 'Choice Team', timezone: 'UTC' });
  teamId = team.id;
  const member = await repos.teamMember.create({
    teamId,
    name: 'Member',
    email: 'member@choice.test',
  });
  memberId = member.id;
  session = await repos.session.create({ teamId, status: 'open' });
  await repos.sessionLink.create({
    token: 'choice-token-1',
    memberId,
    sessionId: session.id,
    expiresAt: new Date(DURING.getTime() + 7 * 24 * 60 * 60 * 1000),
  });
});

describe('a member who has chosen nothing', () => {
  it('is emailed when they have no Slack link', async () => {
    // Requirement 4.3, and Property 7. This is the team the milestone exists
    // for: before phase 2 they were told nothing at all
    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(true);
    expect(email.sentPrompts).toHaveLength(1);
  });

  it('is not emailed when Slack can reach them', async () => {
    /*
     * Requirement 5.2, and the behaviour that changes with this phase. Slack
     * stays the primary route, and a second copy of a message somebody has
     * already read is how a tool teaches people to ignore it.
     */
    await expect(build(true).sendEmailPrompt(memberId, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });

  it('starts being emailed if their Slack link goes away', async () => {
    /*
     * Why the default is derived rather than stored. Unlinking Slack is not a
     * change of preference, but it is a change in what can reach them, and a
     * default written at sign-up could not have known.
     */
    await expect(build(true).sendEmailPrompt(memberId, session)).resolves.toBe(false);
    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(true);
  });
});

describe('a member who has chosen', () => {
  it('is emailed when they asked to be, even with Slack linked', async () => {
    // Requirement 4.1, and Property 6: the choice wins over the default
    await choose(true);

    await expect(build(true).sendEmailPrompt(memberId, session)).resolves.toBe(true);
    expect(email.sentPrompts[0]).toMatchObject({ to: 'member@choice.test' });
  });

  it('is not emailed when they turned it off, even with no Slack link', async () => {
    /*
     * Deliberately allowed, and it leaves them with no prompt channel at all.
     * They can still reach the check from the application, which is what phase
     * 1 built — and a setting that silently refused to apply would be worse
     * than one that does what it says.
     */
    await choose(false);

    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(false);
    expect(email.sentPrompts).toEqual([]);
  });

  it('can go back to having no preference', async () => {
    await choose(false);
    await choose(null);

    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(true);
  });
});

describe('what the preference does not touch', () => {
  it('leaves Slack prompts alone when email is turned off', async () => {
    // Requirement 5.1: Slack behaviour is unchanged by any of this work
    await choose(false);

    await expect(build(true).sendSlackPrompt(memberId, session)).resolves.toBe(true);
    expect(sinkCalls).toEqual([{ memberId, type: 'slack_prompt' }]);
  });

  it('leaves Slack prompts alone when email is turned on', async () => {
    await choose(true);

    const result = await build(true).promptByEveryChannel(memberId, session);

    expect(result).toEqual({ slack: true, email: true });
  });

  it('prompts by email even with reminders turned off', async () => {
    /*
     * Requirement 4.4, the direction that is easy to miss. `remindersEnabled`
     * governs *which* messages are sent — the nudge partway through and the
     * warning that a check is closing — and has never gated the prompt that
     * opens one. `sendSlackPrompt` does not read it, and neither does this.
     *
     * Two adjacent switches both about email is exactly where one quietly
     * starts doing the other one's job.
     */
    await repos.teamMember.update(memberId, { remindersEnabled: false });

    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(true);
    expect(email.sentPrompts).toHaveLength(1);
  });

  it('still refuses to email a member who is away, whatever they asked for', async () => {
    /*
     * The preference says which channels may be used, not whether to ignore
     * availability. Turning email on is not consent to be prompted on leave.
     */
    await choose(true);
    await repos.availability.create({
      memberId,
      awayFrom: new Date('2026-09-15T00:00:00.000Z'),
      awayUntil: new Date('2026-09-20T00:00:00.000Z'),
    });

    await expect(build(false).sendEmailPrompt(memberId, session)).resolves.toBe(false);
  });
});

describe('the hole this leaves, recorded on purpose', () => {
  it('does not fall back to email when Slack delivery fails', async () => {
    /*
     * A Slack-linked member who has chosen nothing hears nothing when Slack
     * fails, because email defaults off for them. This is the stated hole in
     * design decision 3 and it is on the roadmap rather than in this phase: a
     * fallback needs the retry queue to report outcomes, which it does not yet.
     *
     * Asserted rather than left implicit, so that closing it later is a test
     * that changes rather than a surprise somebody rediscovers in production.
     */
    const failing = createNotificationService({
      teamRepo: repos.team,
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      sessionLinkRepo: repos.sessionLink,
      notificationSink: {
        async send(): Promise<void> {
          throw new Error('slack said no');
        },
      },
      slackLinkChecker: { hasSlackLink: async () => true },
      notificationDeliveryRepo: repos.notificationDelivery,
      emailService: email,
      baseUrl: 'https://team-health-check.example',
      now: () => DURING,
    });

    const result = await failing.promptByEveryChannel(memberId, session);

    expect(result).toEqual({ slack: false, email: false });
    expect(email.sentPrompts).toEqual([]);
  });
});
