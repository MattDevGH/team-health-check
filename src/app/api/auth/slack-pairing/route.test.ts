/**
 * Tests for POST /api/auth/slack-pairing
 * Requirements: 2.1, 2.4, 2.5, 7.1, 7.2, 9.3 — Slack pairing code verification
 *
 * The route authenticates via the session cookie and verifies the pairing
 * code for the authenticated member; it never trusts a caller-supplied
 * memberId. We test through the route handler interface using the same
 * production container/repos the route uses.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, _container as container, _repos as repos } from './route';

async function authenticatedRequest(memberId: string, body: unknown): Promise<NextRequest> {
  const token = crypto.randomUUID();
  await repos.userSession.create({ memberId, token, expiresAt: new Date(Date.now() + 60_000) });
  return new NextRequest('http://localhost/api/auth/slack-pairing', {
    method: 'POST',
    headers: { cookie: `session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/slack-pairing', () => {
  it('returns 401 when no session cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABC123' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('links the authenticated cookie member, ignoring a spoofed body memberId', async () => {
    const code = await container.auth.generatePairingCode('U12345');
    const request = await authenticatedRequest('member-1', { code, memberId: 'attacker-member' });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ linked: true, slackUserId: 'U12345' });
    expect(await repos.slackIdentityLink.findByMemberId('member-1')).toMatchObject({ slackUserId: 'U12345' });
    expect(await repos.slackIdentityLink.findByMemberId('attacker-member')).toBeNull();
  });

  it('returns 404 for invalid pairing code', async () => {
    const request = await authenticatedRequest('member-2', { code: 'INVALID' });

    const response = await POST(request);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for already-used pairing code', async () => {
    const code = await container.auth.generatePairingCode('U99999');

    const firstRequest = await authenticatedRequest('member-3', { code });
    const firstResponse = await POST(firstRequest);
    expect(firstResponse.status).toBe(200);

    const secondRequest = await authenticatedRequest('member-4', { code });
    const secondResponse = await POST(secondRequest);
    expect(secondResponse.status).toBe(404);

    const body = await secondResponse.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when code is missing', async () => {
    const request = await authenticatedRequest('member-5', {});

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'code' }),
      ])
    );
  });

  it('returns 400 when code is not a string', async () => {
    const request = await authenticatedRequest('member-6', { code: 123 });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
