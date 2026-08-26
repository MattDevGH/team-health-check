/**
 * Tests that the production sink distinguishes a closing reminder from an
 * opening prompt, and shows only the member's outstanding questions.
 *
 * Task 24.5 acceptance found the sink ignoring its `type` argument when building
 * the message, so a reminder arrived byte-identical to a prompt, and listing
 * every question including already-answered ones.
 *
 * Requirements: Original 13.2, 13.4; Integration 8.2, 8.3
 */

import { describe, it, expect, vi } from 'vitest';

import { createProductionNotificationSink } from './production-notification-sink';
import { InMemorySlackIdentityLinkRepository } from '../repositories/in-memory/slack-identity-link.repository';
import { InMemoryInteractionQueueRepository } from '../repositories/in-memory/interaction-queue.repository';
import { createInMemoryRepositories } from '../repositories';
import type { SlackApiClient } from './delivery';

const MEMBER_ID = 'member-1';
const CLOSES_AT = new Date('2026-08-28T16:00:00.000Z');

async function setup(options: { answered?: string[] } = {}) {
  const repos = createInMemoryRepositories();
  const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();
  await slackIdentityLinkRepo.create({ memberId: MEMBER_ID, slackUserId: 'U_SLACK_1' });

  const session = await repos.session.create({
    teamId: 'team-1',
    status: 'open',
    scheduledCloseAt: CLOSES_AT,
  });
  await repos.sessionLink.create({
    token: 'link-token-abc',
    memberId: MEMBER_ID,
    sessionId: session.id,
    expiresAt: new Date(CLOSES_AT.getTime()),
  });
  for (const questionId of options.answered ?? []) {
    await repos.response.upsert({ memberId: MEMBER_ID, sessionId: session.id, questionId, score: 3 });
  }

  const postMessage = vi.fn().mockResolvedValue({ ok: true });
  const sink = createProductionNotificationSink({
    slackClient: { postMessage } as SlackApiClient,
    slackIdentityLinkRepo,
    slackInteractionQueueRepo: new InMemoryInteractionQueueRepository(),
    questionRepo: repos.question,
    sessionLinkRepo: repos.sessionLink,
    responseRepo: repos.response,
    sessionRepo: repos.session,
    retryDelayMs: 0,
  });

  return { sink, postMessage, sessionId: session.id };
}

function sent(postMessage: ReturnType<typeof vi.fn>): string {
  return JSON.stringify(postMessage.mock.calls[0][0]);
}

describe('production notification sink message selection', () => {
  it('sends closing-soon wording for a closing reminder', async () => {
    const { sink, postMessage, sessionId } = await setup();

    await sink.send(MEMBER_ID, 'closing_reminder', { sessionId, teamId: 'team-1' });

    const payload = sent(postMessage);
    expect(payload.toLowerCase()).toContain('closing');
    expect(payload).not.toContain('Health Check Time!');
  });

  it('keeps the opening prompt wording for a slack prompt', async () => {
    const { sink, postMessage, sessionId } = await setup();

    await sink.send(MEMBER_ID, 'slack_prompt', { sessionId, teamId: 'team-1' });

    expect(sent(postMessage)).toContain('Health Check Time!');
  });

  it('omits questions the member has already answered', async () => {
    const { sink, postMessage, sessionId } = await setup({
      answered: ['q-delivering-value', 'q-team-collaboration'],
    });

    await sink.send(MEMBER_ID, 'closing_reminder', { sessionId, teamId: 'team-1' });

    const payload = sent(postMessage);
    expect(payload).not.toContain('Delivering Value');
    expect(payload).not.toContain('Team Collaboration');
    expect(payload).toContain('Ease of Delivery');
  });

  it('states the session close time in the reminder', async () => {
    const { sink, postMessage, sessionId } = await setup();

    await sink.send(MEMBER_ID, 'closing_reminder', { sessionId, teamId: 'team-1' });

    expect(sent(postMessage)).toContain('2026-08-28');
  });
});
