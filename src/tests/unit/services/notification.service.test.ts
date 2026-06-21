/**
 * Unit tests for notification.service.ts
 * Tests Slack prompt targeting, closing reminders, and mid-session nudges.
 * Validates: Requirements 2.8, 5.2, 5.13, 13.1, 13.2, 13.3, 13.6, 13.8
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import {
  createNotificationService,
  type NotificationSink,
  type SlackLinkChecker,
} from '@/lib/services/notification.service';
import type { HealthCheckSession, TeamMember } from '@/lib/repositories/entities';

describe('NotificationService', () => {
  let repos: Repositories;
  let sink: NotificationSink & { messages: Array<{ memberId: string; type: string; payload: unknown }> };
  let slackLinkChecker: SlackLinkChecker;
  let linkedMemberIds: Set<string>;
  let team: { id: string };
  let session: HealthCheckSession;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    linkedMemberIds = new Set();

    sink = {
      messages: [],
      async send(memberId: string, type: string, payload: unknown) {
        sink.messages.push({ memberId, type, payload });
      },
    };

    slackLinkChecker = {
      async hasSlackLink(memberId: string): Promise<boolean> {
        return linkedMemberIds.has(memberId);
      },
    };

    team = await repos.team.create({ name: 'Test Team' });
    session = await repos.session.create({ teamId: team.id, status: 'open' });
  });

  function createService() {
    return createNotificationService({
      teamMemberRepo: repos.teamMember,
      responseRepo: repos.response,
      questionRepo: repos.question,
      availabilityRepo: repos.availability,
      sessionRepo: repos.session,
      notificationSink: sink,
      slackLinkChecker,
    });
  }

  describe('sendSlackPrompt', () => {
    it('should send prompt to linked member and return true', async () => {
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Alice', email: 'alice@test.com' });
      linkedMemberIds.add(member.id);
      const service = createService();

      const result = await service.sendSlackPrompt(member.id, session);

      expect(result).toBe(true);
      expect(sink.messages).toHaveLength(1);
      expect(sink.messages[0]).toMatchObject({
        memberId: member.id,
        type: 'slack_prompt',
      });
    });

    it('should skip unlinked member and return false', async () => {
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Bob', email: 'bob@test.com' });
      // Not adding to linkedMemberIds — member is unlinked
      const service = createService();

      const result = await service.sendSlackPrompt(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });
  });

  describe('sendClosingReminder', () => {
    let member: TeamMember;

    beforeEach(async () => {
      member = await repos.teamMember.create({ teamId: team.id, name: 'Carol', email: 'carol@test.com' });
      linkedMemberIds.add(member.id);
    });

    it('should skip member who has completed all questions', async () => {
      const questions = await repos.question.findAll();
      // Submit responses for all questions
      for (const q of questions) {
        await repos.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId: q.id,
          score: 3,
        });
      }
      const service = createService();

      const result = await service.sendClosingReminder(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });

    it('should skip away member', async () => {
      const now = new Date();
      await repos.availability.create({
        memberId: member.id,
        awayFrom: new Date(now.getTime() - 86400000),
        awayUntil: new Date(now.getTime() + 86400000),
      });
      const service = createService();

      const result = await service.sendClosingReminder(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });

    it('should skip member with reminders disabled', async () => {
      await repos.teamMember.update(member.id, { remindersEnabled: false });
      const service = createService();

      const result = await service.sendClosingReminder(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });

    it('should send reminder to member who has not completed, not away, reminders on', async () => {
      // Member has Slack link, reminders enabled (default), not away, no responses
      const service = createService();

      const result = await service.sendClosingReminder(member.id, session);

      expect(result).toBe(true);
      expect(sink.messages).toHaveLength(1);
      expect(sink.messages[0]).toMatchObject({
        memberId: member.id,
        type: 'closing_reminder',
      });
    });

    it('should skip unlinked member for closing reminder', async () => {
      linkedMemberIds.delete(member.id);
      const service = createService();

      const result = await service.sendClosingReminder(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });
  });

  describe('sendMidSessionNudge', () => {
    let member: TeamMember;

    beforeEach(async () => {
      member = await repos.teamMember.create({ teamId: team.id, name: 'Dave', email: 'dave@test.com' });
      linkedMemberIds.add(member.id);
    });

    it('should send nudge to member who missed previous session', async () => {
      // Create a previous closed session with no responses from this member
      const prevSession = await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.session.update(prevSession.id, { status: 'closed', actualCloseAt: new Date() });

      const service = createService();

      const result = await service.sendMidSessionNudge(member.id, session);

      expect(result).toBe(true);
      expect(sink.messages).toHaveLength(1);
      expect(sink.messages[0]).toMatchObject({
        memberId: member.id,
        type: 'mid_session_nudge',
      });
    });

    it('should not send nudge if member responded in previous session', async () => {
      // Create a previous closed session with responses from this member
      const prevSession = await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.session.update(prevSession.id, { status: 'closed', actualCloseAt: new Date() });
      await repos.response.upsert({
        memberId: member.id,
        sessionId: prevSession.id,
        questionId: 'q-delivering-value',
        score: 4,
      });

      const service = createService();

      const result = await service.sendMidSessionNudge(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });

    it('should send nudge max once per session (second call returns false)', async () => {
      // Create a previous closed session with no responses
      const prevSession = await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.session.update(prevSession.id, { status: 'closed', actualCloseAt: new Date() });

      const service = createService();

      const first = await service.sendMidSessionNudge(member.id, session);
      const second = await service.sendMidSessionNudge(member.id, session);

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(sink.messages).toHaveLength(1);
    });

    it('should skip unlinked member for nudge', async () => {
      linkedMemberIds.delete(member.id);
      // Create a previous closed session with no responses
      const prevSession = await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.session.update(prevSession.id, { status: 'closed', actualCloseAt: new Date() });

      const service = createService();

      const result = await service.sendMidSessionNudge(member.id, session);

      expect(result).toBe(false);
      expect(sink.messages).toHaveLength(0);
    });
  });
});
