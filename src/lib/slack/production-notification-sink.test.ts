/**
 * Tests for production notification sink.
 * Requirements: 8.1, 8.3, 8.5
 *
 * TDD: These tests define the expected behavior of createProductionNotificationSink.
 */
import { describe, it, expect, vi } from 'vitest';
import { createProductionNotificationSink } from './production-notification-sink';
import { InMemorySlackIdentityLinkRepository } from '../repositories/in-memory/slack-identity-link.repository';
import { InMemoryInteractionQueueRepository } from '../repositories/in-memory/interaction-queue.repository';
import type { SlackApiClient } from './delivery';
import type { QuestionRepository, SessionLinkRepository } from '../repositories/types';

function createMockSlackClient(response: { ok: boolean; error?: string } = { ok: true }): SlackApiClient {
  return {
    postMessage: vi.fn().mockResolvedValue(response),
  };
}

function createMockQuestionRepo(): QuestionRepository {
  return {
    findAll: vi.fn().mockResolvedValue([
      { id: 'q1', title: 'Teamwork', description: 'How well does the team collaborate?', displayOrder: 1 },
      { id: 'q2', title: 'Support', description: 'Do you feel supported?', displayOrder: 2 },
    ]),
    findById: vi.fn().mockResolvedValue(null),
  };
}

function createMockSessionLinkRepo(token: string | null = 'test-token-123'): SessionLinkRepository {
  return {
    create: vi.fn(),
    findByToken: vi.fn().mockResolvedValue(null),
    findByMemberAndSession: vi.fn().mockResolvedValue(
      token
        ? { id: 'sl1', token, memberId: 'member-1', sessionId: 'session-1', expiresAt: new Date(), createdAt: new Date() }
        : null
    ),
  };
}

describe('createProductionNotificationSink', () => {
  describe('send() with linked member', () => {
    it('calls Slack API with correct blocks when member has a Slack link', async () => {
      const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();
      await slackIdentityLinkRepo.create({ memberId: 'member-1', slackUserId: 'U_SLACK_1' });

      const slackClient = createMockSlackClient({ ok: true });
      const interactionQueueRepo = new InMemoryInteractionQueueRepository();
      const questionRepo = createMockQuestionRepo();
      const sessionLinkRepo = createMockSessionLinkRepo('link-token-abc');

      const sink = createProductionNotificationSink({
        slackClient,
        slackIdentityLinkRepo,
        slackInteractionQueueRepo: interactionQueueRepo,
        questionRepo,
        sessionLinkRepo,
        retryDelayMs: 0,
      });

      await sink.send('member-1', 'slack_prompt', { sessionId: 'session-1', teamId: 'team-1' });

      expect(slackClient.postMessage).toHaveBeenCalledTimes(1);
      const call = (slackClient.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.channel).toBe('U_SLACK_1');
      expect(call.blocks).toBeDefined();
      expect(call.blocks.length).toBeGreaterThan(0);
    });
  });

  describe('send() with unlinked member', () => {
    it('does not call Slack API when member has no Slack link', async () => {
      const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();
      // No link created for 'member-no-link'

      const slackClient = createMockSlackClient({ ok: true });
      const interactionQueueRepo = new InMemoryInteractionQueueRepository();
      const questionRepo = createMockQuestionRepo();
      const sessionLinkRepo = createMockSessionLinkRepo();

      const sink = createProductionNotificationSink({
        slackClient,
        slackIdentityLinkRepo,
        slackInteractionQueueRepo: interactionQueueRepo,
        questionRepo,
        sessionLinkRepo,
        retryDelayMs: 0,
      });

      await sink.send('member-no-link', 'slack_prompt', { sessionId: 'session-1', teamId: 'team-1' });

      expect(slackClient.postMessage).not.toHaveBeenCalled();
      expect(interactionQueueRepo.getAll()).toHaveLength(0);
    });
  });

  describe('send() when Slack API fails', () => {
    it('queues to SlackInteractionQueue on delivery failure', async () => {
      const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();
      await slackIdentityLinkRepo.create({ memberId: 'member-1', slackUserId: 'U_SLACK_1' });

      // Slack client that always fails
      const slackClient: SlackApiClient = {
        postMessage: vi.fn().mockResolvedValue({ ok: false, error: 'channel_not_found' }),
      };
      const interactionQueueRepo = new InMemoryInteractionQueueRepository();
      const questionRepo = createMockQuestionRepo();
      const sessionLinkRepo = createMockSessionLinkRepo();

      const sink = createProductionNotificationSink({
        slackClient,
        slackIdentityLinkRepo,
        slackInteractionQueueRepo: interactionQueueRepo,
        questionRepo,
        sessionLinkRepo,
        retryDelayMs: 0,
      });

      // Suppress console.error from delivery retry exhaustion
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await sink.send('member-1', 'slack_prompt', { sessionId: 'session-1', teamId: 'team-1' });

      // Should have queued the failed interaction
      const queued = interactionQueueRepo.getAll();
      expect(queued).toHaveLength(1);
      expect(queued[0].status).toBe('pending');
      expect(queued[0].interactionPayload).toContain('member-1');
      expect(queued[0].failureReason).toBe('channel_not_found');

      consoleErrorSpy.mockRestore();
    });
  });
});
