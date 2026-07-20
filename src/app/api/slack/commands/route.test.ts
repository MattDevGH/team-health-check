/**
 * Tests for POST /api/slack/commands
 * Validates: Requirements 2.2, 5.14, 5.15, 5.16, 7.4
 *
 * - /healthcheck connect generates a pairing code (2.2)
 * - /healthcheck responds with prompts for current session (5.15, 7.4)
 * - No active session returns informative ephemeral message (5.16, 7.4)
 * - Unlinked Slack user returns pairing instructions (7.4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';
import type { Container } from '@/lib/container';

// Mock the verify-signature module to bypass HMAC checks in tests
vi.mock('@/lib/slack/verify-signature', () => ({
  verifySlackSignature: vi.fn(),
}));

function makeSlackCommandRequest(params: Record<string, string>): Request {
  const body = new URLSearchParams(params).toString();
  return new Request('http://localhost/api/slack/commands', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-slack-signature': 'v0=test-signature',
    },
    body,
  });
}

describe('POST /api/slack/commands', () => {
  let repos: Repositories;
  let container: Container;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);

    // Dynamically import and set container + repos
    const routeModule = await import('./route');
    routeModule._setContainer(container);
    routeModule._setRepos(repos);
  });

  describe('/healthcheck connect', () => {
    it('generates a pairing code and returns ephemeral response', async () => {
      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: 'connect',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toContain('pairing code');
      // Code should be 6 uppercase alphanumeric chars
      const codeMatch = body.text.match(/[A-Z0-9]{6}/);
      expect(codeMatch).not.toBeNull();
      expect(body.text).toContain('10 minutes');
    });
  });

  describe('/healthcheck (default — show prompt)', () => {
    it('returns health check prompt blocks when linked member has open session', async () => {
      // Set up: create team, member, open session, and link Slack identity
      const team = await repos.team.create({ name: 'Prompt Team' });
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Alice',
        email: 'alice@example.com',
      });
      await repos.session.create({ teamId: team.id, status: 'open' });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'ULINKED1',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'ULINKED1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      // Should contain prompt-related content (health check link or blocks)
      expect(body.text).toContain('health check');
      expect(body.text).toContain('session');
      // Should NOT say "no active session"
      expect(body.text).not.toContain('No active health check session');
    });

    it('returns "no active session" message when linked member has no open session', async () => {
      // Set up: create team, member, NO open session, and link Slack identity
      const team = await repos.team.create({ name: 'No Session Team' });
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Bob',
        email: 'bob@example.com',
      });
      // No session created — or only closed sessions
      await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'ULINKED2',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'ULINKED2',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toContain('No active health check session');
    });

    it('returns pairing instructions when Slack user is not linked', async () => {
      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'UUNLINKED1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      // Should contain instructions for pairing
      expect(body.text).toContain('/healthcheck connect');
      // Should NOT say "no active session" — it's a different scenario
      expect(body.text).not.toContain('No active health check session');
    });
  });

  describe('unknown command', () => {
    it('returns unknown command message for unrecognized commands', async () => {
      const req = makeSlackCommandRequest({
        command: '/something-else',
        text: '',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toBe('Unknown command.');
    });
  });

  describe('signature verification failure', () => {
    it('returns 403 when signature is invalid', async () => {
      const { verifySlackSignature } = await import('@/lib/slack/verify-signature');
      const mockVerify = vi.mocked(verifySlackSignature);
      const { ForbiddenError } = await import('@/lib/errors');
      mockVerify.mockImplementationOnce(() => {
        throw new ForbiddenError('Invalid Slack signature');
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);

      expect(res.status).toBe(403);
    });
  });
});
