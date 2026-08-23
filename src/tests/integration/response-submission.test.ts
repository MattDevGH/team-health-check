/**
 * Integration tests: Full response submission flow.
 * Validates: Requirements 4.1, 4.6, 5.6, 5.8, 16.1
 *
 * Test 1: Web submission flow
 *   session link → form render → POST response → upsert → rolling average display
 *
 * Test 2: Slack interaction flow
 *   Slack interaction → immediate ack → deferred DB write → confirmation
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createContainer, type Container } from '@/lib/container';

const QUESTION_IDS = [
  'q-delivering-value',
  'q-team-collaboration',
  'q-ease-of-delivery',
  'q-learning-improving',
  'q-psychological-safety',
];

describe('Response submission flow - integration', () => {
  let repos: Repositories;
  let container: Container;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);
  });

  describe('Test 1: Web submission flow (session link → response → rolling average)', () => {
    it('full flow: create team → add member → open session → validate link → submit → rolling average', async () => {
      // 1. Create a team
      const team = await container.team.create('Engineering Squad', 'Frontend team', 'creator-1');

      // 2. Add a member
      const member = await container.team.addMember(team.id, 'Alice Smith', 'alice@example.com');

      // 3. Open a session (generates session links automatically)
      const session = await container.session.open(team.id, 'creator-1');

      // 4. Find the session link token for the member
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link).not.toBeNull();
      expect(link!.token.length).toBeGreaterThanOrEqual(32);

      // 5. Validate the session link token (simulates user clicking the link)
      const context = await container.auth.validateSessionLink(link!.token);
      expect(context).not.toBeNull();
      expect(context!.memberId).toBe(member.id);
      expect(context!.sessionId).toBe(session.id);

      // 6. Submit responses for all 5 questions (simulates form POST)
      for (let i = 0; i < QUESTION_IDS.length; i++) {
        const response = await container.response.upsert({
          memberId: context!.memberId,
          sessionId: context!.sessionId,
          questionId: QUESTION_IDS[i],
          score: i + 1, // scores 1,2,3,4,5
          trendIndicator: 'stable',
        });
        expect(response.score).toBe(i + 1);
        expect(response.questionId).toBe(QUESTION_IDS[i]);
      }

      // 7. Verify responses can be retrieved for the member/session
      const stored = await repos.response.findByMemberAndSession(member.id, session.id);
      expect(stored).toHaveLength(5);
    });

    it('rolling average is calculated correctly after sufficient submissions', async () => {
      // Setup: Create team and member
      const team = await container.team.create('Data Team', undefined, 'creator-2');
      const member = await container.team.addMember(team.id, 'Bob', 'bob@example.com');

      // Submit 5+ responses across multiple sessions for rolling average to work
      const questionId = QUESTION_IDS[0];
      const scores = [4, 3, 5, 4, 3]; // 5 scores → average = 3.8

      for (let i = 0; i < scores.length; i++) {
        const session = await container.session.open(team.id, 'creator-2');
        await container.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId,
          score: scores[i],
        });
      }

      // Verify rolling average
      const rollingAvg = await container.response.getRollingAverage(team.id, questionId);
      expect(rollingAvg).not.toBeNull();

      // Expected: (4 + 3 + 5 + 4 + 3) / 5 = 3.8
      expect(rollingAvg).toBe(3.8);
    });

    it('rolling average returns null when fewer than 5 responses exist', async () => {
      const team = await container.team.create('Small Team', undefined, 'creator-3');
      const member = await container.team.addMember(team.id, 'Carol', 'carol@example.com');
      const questionId = QUESTION_IDS[1];

      // Only 3 responses — below the threshold
      for (let i = 0; i < 3; i++) {
        const session = await container.session.open(team.id, 'creator-3');
        await container.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId,
          score: 4,
        });
      }

      const rollingAvg = await container.response.getRollingAverage(team.id, questionId);
      expect(rollingAvg).toBeNull();
    });

    it('re-submission (upsert) updates existing response rather than creating a duplicate', async () => {
      // Setup
      const team = await container.team.create('Upsert Team', undefined, 'creator-4');
      const member = await container.team.addMember(team.id, 'Dave', 'dave@example.com');
      const session = await container.session.open(team.id, 'creator-4');
      const questionId = QUESTION_IDS[0];

      // First submission
      const first = await container.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId,
        score: 3,
        trendIndicator: 'stable',
      });
      expect(first.score).toBe(3);

      // Re-submission with updated score
      const second = await container.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId,
        score: 5,
        trendIndicator: 'improving',
      });
      expect(second.score).toBe(5);
      expect(second.trendIndicator).toBe('improving');

      // Verify exactly one record exists (upsert, not duplicate)
      const allResponses = await repos.response.findByMemberAndSession(member.id, session.id);
      const forQuestion = allResponses.filter(r => r.questionId === questionId);
      expect(forQuestion).toHaveLength(1);
      expect(forQuestion[0].score).toBe(5);
      expect(forQuestion[0].trendIndicator).toBe('improving');
    });

    it('invalid session link token returns null', async () => {
      const result = await container.auth.validateSessionLink('completely-bogus-token-that-does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('Test 2: Slack interaction flow (Slack identity → score submission → confirmation)', () => {
    it('full flow: create team → add member → link Slack → open session → submit via service → verify', async () => {
      // 1. Create a team and add a member
      const team = await container.team.create('Slack Team', 'Uses Slack', 'creator-5');
      const member = await container.team.addMember(team.id, 'Eve', 'eve@example.com');

      // 2. Link Slack identity via pairing code flow
      const slackUserId = 'U_EVE_SLACK_123';
      const pairingCode = await container.auth.generatePairingCode(slackUserId);
      expect(pairingCode).toHaveLength(6);

      // Verify pairing code (simulates web form submission of the code)
      const pairingResult = await container.auth.verifyPairingCode(member.id, pairingCode);
      expect(pairingResult).not.toBeNull();
      expect(pairingResult!.slackUserId).toBe(slackUserId);

      // 3. Open a session
      const session = await container.session.open(team.id, 'creator-5');

      // 4. Simulate Slack interaction: user taps score button for a question
      //    In production, the Slack interactions route handler would:
      //    a) Immediately ack (200 to Slack)
      //    b) Asynchronously call container.response.upsert
      //    Here we test the deferred DB write portion directly.
      const questionId = QUESTION_IDS[2]; // "Ease of Delivery"
      const response = await container.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId,
        score: 4,
        trendIndicator: 'improving',
      });

      // 5. Verify the response is persisted correctly
      expect(response.memberId).toBe(member.id);
      expect(response.sessionId).toBe(session.id);
      expect(response.questionId).toBe(questionId);
      expect(response.score).toBe(4);
      expect(response.trendIndicator).toBe('improving');

      // 6. Verify the response can be retrieved for the member/session
      const responses = await repos.response.findByMemberAndSession(member.id, session.id);
      expect(responses).toHaveLength(1);
      expect(responses[0].score).toBe(4);
    });

    it('Slack submission updates existing response (upsert behaviour)', async () => {
      // Setup team + member + session
      const team = await container.team.create('Slack Upsert Team', undefined, 'creator-6');
      const member = await container.team.addMember(team.id, 'Frank', 'frank@example.com');
      const session = await container.session.open(team.id, 'creator-6');
      const questionId = QUESTION_IDS[3]; // "Learning and Improving"

      // First Slack interaction — score 2
      await container.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId,
        score: 2,
        trendIndicator: 'declining',
      });

      // Second Slack interaction — user changes mind, score 4
      const updated = await container.response.upsert({
        memberId: member.id,
        sessionId: session.id,
        questionId,
        score: 4,
        trendIndicator: 'stable',
      });

      expect(updated.score).toBe(4);
      expect(updated.trendIndicator).toBe('stable');

      // Verify only one record exists
      const responses = await repos.response.findByMemberAndSession(member.id, session.id);
      const forQuestion = responses.filter(r => r.questionId === questionId);
      expect(forQuestion).toHaveLength(1);
    });

    it('multiple questions submitted via Slack in sequence are all persisted', async () => {
      // Setup
      const team = await container.team.create('Multi-Q Slack Team', undefined, 'creator-7');
      const member = await container.team.addMember(team.id, 'Grace', 'grace@example.com');
      const session = await container.session.open(team.id, 'creator-7');

      // Simulate Slack interactions for all 5 questions (one by one, as buttons are tapped)
      for (let i = 0; i < QUESTION_IDS.length; i++) {
        await container.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId: QUESTION_IDS[i],
          score: 3,
        });
      }

      // Verify all 5 responses stored
      const responses = await repos.response.findByMemberAndSession(member.id, session.id);
      expect(responses).toHaveLength(5);

      // Verify each question has exactly one response
      for (const qId of QUESTION_IDS) {
        const forQ = responses.filter(r => r.questionId === qId);
        expect(forQ).toHaveLength(1);
        expect(forQ[0].score).toBe(3);
      }
    });

    it('Slack submission rejected for closed session', async () => {
      const team = await container.team.create('Closed Session Team', undefined, 'creator-8');
      const member = await container.team.addMember(team.id, 'Hank', 'hank@example.com');
      const session = await container.session.open(team.id, 'creator-8');

      // Close the session
      await container.session.close(team.id, session.id, 'creator-8');

      // Attempt submission to closed session — should be rejected
      await expect(
        container.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId: QUESTION_IDS[0],
          score: 4,
        }),
      ).rejects.toThrow('Session is closed');
    });
  });
});
