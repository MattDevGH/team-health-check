/**
 * Tests for POST /api/slack/interactions
 *
 * Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, NFR 1.2
 * Validates: Slack interaction payload parsing, score validation,
 * response upsert, confirmation on success, error on failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { POST, _repos as repos } from './route';

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
  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-slack-signing-secret');
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

    // Wire the Slack identity via the slackIdentityStore
    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('USLACK123', member.id);

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

    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('UINVALID1', member.id);

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

    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('ULOW1', member.id);

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

    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('UUPSERT1', member.id);

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

    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('UCLOSED1', member.id);

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

  it('handles multiple actions in a single interaction payload', async () => {
    const team = await repos.team.create({ name: 'Multi-Action Team' });
    const member = await repos.teamMember.create({ teamId: team.id, name: 'Multi User', email: 'multi@example.com' });
    const session = await repos.session.create({ teamId: team.id, status: 'open' });

    const { _slackIdentityStore } = await import('./route');
    _slackIdentityStore.set('UMULTI1', member.id);

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
