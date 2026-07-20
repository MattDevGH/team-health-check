/**
 * Auth Helper Tests
 * Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.8
 *
 * Tests for getAuthContext and withAuth functions that validate
 * session cookies against the UserSession repository.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { createGetAuthContext, createWithAuth } from './with-auth';
import { InMemoryUserSessionRepository } from '../repositories/in-memory/user-session.repository';
import type { AuthContext } from './with-auth';

function buildRequest(cookieValue?: string): NextRequest {
  const url = 'http://localhost:3000/api/me';
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set('cookie', `session=${cookieValue}`);
  }
  return new NextRequest(url, { headers });
}

describe('getAuthContext', () => {
  let userSessionRepo: InMemoryUserSessionRepository;
  let getAuthContext: (request: NextRequest) => Promise<AuthContext | null>;

  beforeEach(() => {
    userSessionRepo = new InMemoryUserSessionRepository();
    getAuthContext = createGetAuthContext({ userSessionRepo });
  });

  it('returns null when no session cookie is present', async () => {
    const request = buildRequest();
    const result = await getAuthContext(request);
    expect(result).toBeNull();
  });

  it('returns null when session token does not match any session', async () => {
    const request = buildRequest('nonexistent-token');
    const result = await getAuthContext(request);
    expect(result).toBeNull();
  });

  it('returns null when session token is expired', async () => {
    const pastDate = new Date(Date.now() - 1000);
    await userSessionRepo.create({
      memberId: 'member-1',
      token: 'expired-token',
      expiresAt: pastDate,
    });

    const request = buildRequest('expired-token');
    const result = await getAuthContext(request);
    expect(result).toBeNull();
  });

  it('returns AuthContext with memberId for a valid, non-expired session', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await userSessionRepo.create({
      memberId: 'member-42',
      token: 'valid-token',
      expiresAt: futureDate,
    });

    const request = buildRequest('valid-token');
    const result = await getAuthContext(request);
    expect(result).toEqual({ memberId: 'member-42' });
  });

  it('returns null when cookie value is empty string', async () => {
    const request = buildRequest('');
    const result = await getAuthContext(request);
    expect(result).toBeNull();
  });
});

describe('withAuth', () => {
  let userSessionRepo: InMemoryUserSessionRepository;
  let withAuth: ReturnType<typeof createWithAuth>;

  beforeEach(() => {
    userSessionRepo = new InMemoryUserSessionRepository();
    const getAuthContext = createGetAuthContext({ userSessionRepo });
    withAuth = createWithAuth({ getAuthContext });
  });

  it('returns 401 JSON response when no session cookie is present', async () => {
    const handler = async (_req: NextRequest, _ctx: unknown, _auth: AuthContext) => {
      return Response.json({ ok: true });
    };

    const wrapped = withAuth(handler);
    const request = buildRequest();
    const context = { params: Promise.resolve({}) };

    const response = await wrapped(request, context);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('returns 401 when session token is invalid', async () => {
    const handler = async (_req: NextRequest, _ctx: unknown, _auth: AuthContext) => {
      return Response.json({ ok: true });
    };

    const wrapped = withAuth(handler);
    const request = buildRequest('bad-token');
    const context = { params: Promise.resolve({}) };

    const response = await wrapped(request, context);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session token is expired', async () => {
    const pastDate = new Date(Date.now() - 1000);
    await userSessionRepo.create({
      memberId: 'member-1',
      token: 'expired-token',
      expiresAt: pastDate,
    });

    const handler = async (_req: NextRequest, _ctx: unknown, _auth: AuthContext) => {
      return Response.json({ ok: true });
    };

    const wrapped = withAuth(handler);
    const request = buildRequest('expired-token');
    const context = { params: Promise.resolve({}) };

    const response = await wrapped(request, context);
    expect(response.status).toBe(401);
  });

  it('calls the handler with AuthContext when session is valid', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await userSessionRepo.create({
      memberId: 'member-99',
      token: 'good-token',
      expiresAt: futureDate,
    });

    let receivedAuth: AuthContext | null = null;
    const handler = async (_req: NextRequest, _ctx: unknown, auth: AuthContext) => {
      receivedAuth = auth;
      return Response.json({ memberId: auth.memberId });
    };

    const wrapped = withAuth(handler);
    const request = buildRequest('good-token');
    const context = { params: Promise.resolve({ teamId: 'team-1' }) };

    const response = await wrapped(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.memberId).toBe('member-99');
    expect(receivedAuth).toEqual({ memberId: 'member-99' });
  });

  it('passes through the context params to the handler', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    await userSessionRepo.create({
      memberId: 'member-1',
      token: 'valid-token',
      expiresAt: futureDate,
    });

    let receivedParams: Record<string, string> = {};
    const handler = async (_req: NextRequest, ctx: { params: Promise<Record<string, string>> }, _auth: AuthContext) => {
      receivedParams = await ctx.params;
      return Response.json({ ok: true });
    };

    const wrapped = withAuth(handler);
    const request = buildRequest('valid-token');
    const context = { params: Promise.resolve({ teamId: 'team-abc' }) };

    await wrapped(request, context);
    expect(receivedParams).toEqual({ teamId: 'team-abc' });
  });
});
