import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/container-production', async () => {
  const { createContainer } = await import('@/lib/container');
  const { createInMemoryRepositories } = await import('@/lib/repositories');
  const repos = createInMemoryRepositories();

  return { container: createContainer(repos), repos };
});

import { repos } from '@/lib/container-production';

import { POST } from './route';

const LOCAL_CLEAR_COOKIE = 'session=; Path=/; Max-Age=0; SameSite=lax; HttpOnly';

function logoutRequest(token?: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: token ? { cookie: `session=${token}` } : undefined,
  });
}

beforeEach(async () => {
  await Promise.all(
    ['logout-token', 'other-token', 'expired-token'].map((token) =>
      repos.userSession.deleteByToken(token),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/auth/logout', () => {
  it('revokes only the presented session and clears its cookie', async () => {
    await repos.userSession.create({
      memberId: 'member-1',
      token: 'logout-token',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await repos.userSession.create({
      memberId: 'member-1',
      token: 'other-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await POST(logoutRequest('logout-token'));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toBe(LOCAL_CLEAR_COOKIE);
    await expect(repos.userSession.findByToken('logout-token')).resolves.toBeNull();
    await expect(repos.userSession.findByToken('other-token')).resolves.not.toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'unknown-token'],
  ])('clears the cookie for a %s session without exposing token validity', async (_case, token) => {
    const response = await POST(logoutRequest(token));

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBe(LOCAL_CLEAR_COOKIE);
  });

  it('revokes an expired persisted session before clearing the cookie', async () => {
    await repos.userSession.create({
      memberId: 'member-2',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const response = await POST(logoutRequest('expired-token'));

    expect(response.status).toBe(204);
    await expect(repos.userSession.findByToken('expired-token')).resolves.toBeNull();
  });

  it('adds Secure when the application URL uses HTTPS', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://health.example.com');

    const response = await POST(logoutRequest());

    expect(response.headers.get('set-cookie')).toBe(`${LOCAL_CLEAR_COOKIE}; Secure`);
  });
});
