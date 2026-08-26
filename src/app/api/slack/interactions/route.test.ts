/**
 * Tests for POST /api/slack/interactions
 *
 * Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, NFR 1.2
 * Validates: Slack interaction payload parsing, score validation,
 * response upsert, confirmation on success, error on failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { POST, _repos as repos, _setInteractionResponder } from './route';
import type { InteractionResponder } from '@/lib/slack/interaction-response';

/** Records replies instead of POSTing to Slack's response_url. */
function createRecordingResponder(): InteractionResponder & {
  replies: Array<{ responseUrl: string; text: string }>;
} {
  const replies: Array<{ responseUrl: string; text: string }> = [];
  return {
    replies,
    async respond(responseUrl: string, text: string): Promise<boolean> {
      replies.push({ responseUrl, text });
      return true;
    },
  };
}

/** Helper to seed a SlackIdentityLink via the repository */
async function linkSlackUser(slackUserId: string, memberId: string) {
  await repos.slackIdentityLink.create({ slackUserId, memberId });
}

/** Helper to generate a valid Slack signature for a body/timestamp */
function signRequest(body: string, timestamp: string): string {
  const secret = 'test-slack-signing-secret';
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

/** Helper to build a Slack interaction payload */
function buildInteractionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'block_actions',
    user: { id: 'USLACK123', name: 'testuser' },
    actions: [
      {
        action_id: 'score_q-delivering-value_3',
        block_id: 'score_q-delivering-value',
        value: 'q-delivering-value:3',
        type: 'button',
      },
    ],
    response_url: 'https://hooks.slack.com/actions/T123/456/response',
    ...overrides,
  };
}

/** Helper to create a request with proper signature */
function makeSignedRequest(payload: Record<string, unknown>): Request {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const signature = signRequest(body, timestamp);

  return new Request('http://localhost/api/slack/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body,
  });
}

describe('POST /api/slack/interactions', () => {
  let responder: ReturnType<typeof createRecordingResponder>;

  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-slack-signing-secret');
    responder = createRecordingResponder();
    _setInteractionResponder(responder);
  });

  it('returns 403 when signature is invalid', async () => {
    const payload = buildInteractionPayload();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;

    const req = new Request('http://localhost/api/slack/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': 'v0=invalidsignature',
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 when payload field is missing', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'nopayload=true';
    const signature = signRequest(body, timestamp);

    const req = new Request('http://localhost/api/slack/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': signature,
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 ack for valid block_actions with valid score', async () => {
    // Set up: create a team, member, session, and link Slack identity
    const team = await repos.team.create({ name: 'Test Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Test User', email: 'test@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // Wire the Slack identity via the SlackIdentityLink repository
    await linkSlackUser('USLACK123', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'USLACK123', name: 'testuser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_3',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:3',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify response was upserted
    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].questionId).toBe('q-delivering-value');
    expect(responses[0].score).toBe(3);
  });

  it('returns 200 ack but does not upsert when score is invalid (out of range)', async () => {
    const team = await repos.team.create({ name: 'Team Invalid Score' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'User 2', email: 'user2@example.com' });
    await repos.session.create({ teamId: team.id, status: 'open' });

    await linkSlackUser('UINVALID1', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'UINVALID1', name: 'baduser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_7',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:7',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    // Still ack 200 (Slack requires it), but response not stored
    expect(res.status).toBe(200);

    const responses = await repos.response.findByMemberAndSession(member.id, (await repos.session.findOpenByTeamId((await repos.team.findById(team.id))!.id))!.id);
    expect(responses).toHaveLength(0);
  });

  it('returns 200 ack but does not upsert when score is below 1', async () => {
    const team = await repos.team.create({ name: 'Team Low Score' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'User 3', email: 'user3@example.com' });
    await repos.session.create({ teamId: team.id, status: 'open' });

    await linkSlackUser('ULOW1', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'ULOW1', name: 'lowuser' },
      actions: [
        {
          action_id: 'score_q-team-collaboration_0',
          block_id: 'score_q-team-collaboration',
          value: 'q-team-collaboration:0',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const responses = await repos.response.findByMemberAndSession(member.id, (await repos.session.findOpenByTeamId(team.id))!.id);
    expect(responses).toHaveLength(0);
  });

  it('upserts response when member submits again (update existing)', async () => {
    const team = await repos.team.create({ name: 'Upsert Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Upserter', email: 'upsert@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    await linkSlackUser('UUPSERT1', member.id);

    // First submission: score 2
    const payload1 = buildInteractionPayload({
      user: { id: 'UUPSERT1', name: 'upserter' },
      actions: [
        {
          action_id: 'score_q-delivering-value_2',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:2',
          type: 'button',
        },
      ],
    });

    let req = makeSignedRequest(payload1);
    let res = await POST(req);
    expect(res.status).toBe(200);

    // Second submission: score 5
    const payload2 = buildInteractionPayload({
      user: { id: 'UUPSERT1', name: 'upserter' },
      actions: [
        {
          action_id: 'score_q-delivering-value_5',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:5',
          type: 'button',
        },
      ],
    });

    req = makeSignedRequest(payload2);
    res = await POST(req);
    expect(res.status).toBe(200);

    // Should be one record with latest score
    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].score).toBe(5);
  });

  it('returns 200 ack when session is closed (no upsert, graceful handling)', async () => {
    const team = await repos.team.create({ name: 'Closed Session Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Late User', email: 'late@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'closed' });

    await linkSlackUser('UCLOSED1', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'UCLOSED1', name: 'lateuser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_4',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:4',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    // Ack 200 to Slack but no response stored
    expect(res.status).toBe(200);

    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(0);
  });

  it('returns 200 ack when Slack user has no linked identity', async () => {
    // Requirement 7.3: unknown Slack userId → ack 200 but no processing
    const payload = buildInteractionPayload({
      user: { id: 'UUNKNOWN999', name: 'ghost' },
      actions: [
        {
          action_id: 'score_q-delivering-value_3',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:3',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    // Ack 200 — gracefully handle unlinked user
    expect(res.status).toBe(200);
  });

  it('resolves Slack userId from SlackIdentityLink repository to correct memberId', async () => {
    // Requirement 7.3: Slack userId in DB → resolves to memberId and processes interaction
    const team = await repos.team.create({ name: 'Repo Resolution Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Linked User', email: 'linked@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // Seed via repository (not in-memory Map)
    await linkSlackUser('UREPO_LINKED', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'UREPO_LINKED', name: 'linkeduser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_4',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:4',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify the response was persisted for the correct member
    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].questionId).toBe('q-delivering-value');
    expect(responses[0].score).toBe(4);
  });

  describe('member-visible replies (Requirements 5.7, 5.8, 5.9)', () => {
    it('confirms a recorded score, naming the question and score', async () => {
      const team = await repos.team.create({ name: 'Confirm Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Confirmed', email: 'confirm@example.com' });
      await repos.session.create({ teamId: team.id, status: 'open' });
      await linkSlackUser('UCONFIRM1', member.id);

      const res = await POST(
        makeSignedRequest(
          buildInteractionPayload({
            user: { id: 'UCONFIRM1', name: 'confirmed' },
            actions: [
              {
                action_id: 'score_q-ease-of-delivery_4',
                block_id: 'score_q-ease-of-delivery',
                value: 'q-ease-of-delivery:4',
                type: 'button',
              },
            ],
          }),
        ),
      );

      expect(res.status).toBe(200);
      expect(responder.replies).toHaveLength(1);
      expect(responder.replies[0].responseUrl).toBe('https://hooks.slack.com/actions/T123/456/response');
      expect(responder.replies[0].text).toContain('Ease of Delivery');
      expect(responder.replies[0].text).toContain('4');
      // Requirement 5.10: the member can still change their answer
      expect(responder.replies[0].text).toContain('change');
    });

    it('reports a validation error naming the question for an out-of-range score', async () => {
      const team = await repos.team.create({ name: 'Reject Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Rejected', email: 'reject@example.com' });
      await repos.session.create({ teamId: team.id, status: 'open' });
      await linkSlackUser('UREJECT1', member.id);

      const res = await POST(
        makeSignedRequest(
          buildInteractionPayload({
            user: { id: 'UREJECT1', name: 'rejected' },
            actions: [
              {
                action_id: 'score_q-psychological-safety_9',
                block_id: 'score_q-psychological-safety',
                value: 'q-psychological-safety:9',
                type: 'button',
              },
            ],
          }),
        ),
      );

      expect(res.status).toBe(200);
      expect(responder.replies).toHaveLength(1);
      expect(responder.replies[0].text).toContain('Psychological Safety');
      expect(responder.replies[0].text).toContain('1 and 5');
    });

    it('tells the member the session has ended when nothing is open', async () => {
      const team = await repos.team.create({ name: 'Ended Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Ended', email: 'ended@example.com' });
      await repos.session.create({ teamId: team.id, status: 'closed' });
      await linkSlackUser('UENDED1', member.id);

      const res = await POST(
        makeSignedRequest(
          buildInteractionPayload({ user: { id: 'UENDED1', name: 'ended' } }),
        ),
      );

      expect(res.status).toBe(200);
      expect(responder.replies).toHaveLength(1);
      expect(responder.replies[0].text).toContain('ended');
    });

    it('points an unlinked Slack user at the pairing command', async () => {
      const res = await POST(
        makeSignedRequest(
          buildInteractionPayload({ user: { id: 'UNOLINK999', name: 'ghost' } }),
        ),
      );

      expect(res.status).toBe(200);
      expect(responder.replies).toHaveLength(1);
      expect(responder.replies[0].text).toContain('/healthcheck connect');
    });

    it('skips the reply when Slack sends no response_url', async () => {
      const team = await repos.team.create({ name: 'No Url Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'NoUrl', email: 'nourl@example.com' });
      const session = await repos.session.create({ teamId: team.id, status: 'open' });
      await linkSlackUser('UNOURL1', member.id);

      const payload = buildInteractionPayload({ user: { id: 'UNOURL1', name: 'nourl' } });
      delete payload.response_url;

      const res = await POST(makeSignedRequest(payload));

      expect(res.status).toBe(200);
      expect(responder.replies).toHaveLength(0);
      // The score is still recorded — only the reply is skipped
      const responses = await repos.response.findByMemberAndSession(member.id, session.id);
      expect(responses).toHaveLength(1);
    });

    it('still acknowledges Slack when the reply fails to deliver', async () => {
      const team = await repos.team.create({ name: 'Reply Fail Team' });
      const member = await repos.teamMember.create({ teamId: team.id, name: 'Failer', email: 'failer@example.com' });
      const session = await repos.session.create({ teamId: team.id, status: 'open' });
      await linkSlackUser('UFAIL1', member.id);

      _setInteractionResponder({
        async respond(): Promise<boolean> {
          throw new Error('network down');
        },
      });

      const res = await POST(
        makeSignedRequest(
          buildInteractionPayload({ user: { id: 'UFAIL1', name: 'failer' } }),
        ),
      );

      // The 3-second ack contract survives a failed reply
      expect(res.status).toBe(200);
      const responses = await repos.response.findByMemberAndSession(member.id, session.id);
      expect(responses).toHaveLength(1);
    });
  });

  it('returns 200 ack without processing when Slack userId has no SlackIdentityLink record', async () => {
    // Requirement 7.3: unknown Slack userId → no DB record → graceful 200 ack
    const team = await repos.team.create({ name: 'No Link Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Orphan', email: 'orphan@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    // Deliberately do NOT link UORPHAN_SLACK to any member

    const payload = buildInteractionPayload({
      user: { id: 'UORPHAN_SLACK', name: 'orphanuser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_3',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:3',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify no response was stored for the member
    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(0);
  });

  it('handles multiple actions in a single interaction payload', async () => {
    const team = await repos.team.create({ name: 'Multi-Action Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Multi User', email: 'multi@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    await linkSlackUser('UMULTI1', member.id);

    const payload = buildInteractionPayload({
      user: { id: 'UMULTI1', name: 'multiuser' },
      actions: [
        {
          action_id: 'score_q-delivering-value_4',
          block_id: 'score_q-delivering-value',
          value: 'q-delivering-value:4',
          type: 'button',
        },
        {
          action_id: 'score_q-team-collaboration_5',
          block_id: 'score_q-team-collaboration',
          value: 'q-team-collaboration:5',
          type: 'button',
        },
      ],
    });

    const req = makeSignedRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const responses = await repos.response.findByMemberAndSession(member.id, session.id);
    expect(responses).toHaveLength(2);

    const scores = responses.map(r => ({ questionId: r.questionId, score: r.score }));
    expect(scores).toContainEqual({ questionId: 'q-delivering-value', score: 4 });
    expect(scores).toContainEqual({ questionId: 'q-team-collaboration', score: 5 });
  });
});
