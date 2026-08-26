import { describe, it, expect, beforeEach, vi } from 'vitest';

// Requirements: 1.1, 1.5, 7.2, 7.4, 7.9

describe('GET /api/auth/magic-link/verify/[token]', () => {
  beforeEach(async () => {
    // Each test imports the module fresh for isolation
    vi.unstubAllEnvs();
  });

  it('returns authenticated result for valid magic link token', async () => {
    // We need to use the route's module-level container to seed data
    // This tests the integration between route and service
    const { GET: handler, _testContainer } = await import('./route');

    // Seed a team member and magic link
    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-1',
        email: 'test@example.com',
        name: 'Test User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'valid-token-123',
        memberId: 'member-1',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/valid-token-123');
    const context = { params: Promise.resolve({ token: 'valid-token-123' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('authenticated');
    expect(body.memberId).toBe('member-1');
    expect(body.sessionToken).toBeDefined();
  });

  it('sets Set-Cookie header with session token on successful authentication', async () => {
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-cookie-1',
        email: 'cookie@example.com',
        name: 'Cookie User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'cookie-token-abc',
        memberId: 'member-cookie-1',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/cookie-token-abc');
    const context = { params: Promise.resolve({ token: 'cookie-token-abc' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('authenticated');

    // Verify Set-Cookie header is present with the session token
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`session=${body.sessionToken}`);
  });

  it('Set-Cookie header contains HttpOnly, SameSite=lax, and Max-Age=604800', async () => {
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-cookie-2',
        email: 'attrs@example.com',
        name: 'Attrs User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'attrs-token-def',
        memberId: 'member-cookie-2',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/attrs-token-def');
    const context = { params: Promise.resolve({ token: 'attrs-token-def' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Max-Age=604800');
  });

  it('Set-Cookie header includes Secure flag in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    // Re-import to pick up new env
    vi.resetModules();
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-cookie-3',
        email: 'secure@example.com',
        name: 'Secure User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'secure-token-ghi',
        memberId: 'member-cookie-3',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/secure-token-ghi');
    const context = { params: Promise.resolve({ token: 'secure-token-ghi' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('Secure');
  });

  it('Set-Cookie header omits Secure flag in non-production without HTTPS', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

    vi.resetModules();
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-cookie-4',
        email: 'nosecure@example.com',
        name: 'NoSecure User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'nosecure-token-jkl',
        memberId: 'member-cookie-4',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/nosecure-token-jkl');
    const context = { params: Promise.resolve({ token: 'nosecure-token-jkl' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).not.toContain('Secure');
  });

  it('does NOT set Set-Cookie header for genesis (requires_team_creation) result', async () => {
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.pendingGenesis.create({
        token: 'genesis-no-cookie-456',
        email: 'genesis-nocookie@example.com',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/genesis-no-cookie-456');
    const context = { params: Promise.resolve({ token: 'genesis-no-cookie-456' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('requires_team_creation');

    // Genesis flow should NOT set a cookie — cookie is set after team creation completes
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).toBeNull();
  });

  it('returns genesis state for pending genesis token', async () => {
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.pendingGenesis.create({
        token: 'genesis-token-456',
        email: 'newuser@example.com',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request = new Request('http://localhost/api/auth/magic-link/verify/genesis-token-456');
    const context = { params: Promise.resolve({ token: 'genesis-token-456' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('requires_team_creation');
    expect(body.email).toBe('newuser@example.com');
    expect(body.pendingToken).toBeDefined();
  });

  it('returns 404 for invalid/expired token', async () => {
    const { GET: handler } = await import('./route');

    const request = new Request('http://localhost/api/auth/magic-link/verify/invalid-token');
    const context = { params: Promise.resolve({ token: 'invalid-token' }) };

    const response = await handler(request, context);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for already-used token (single-use)', async () => {
    const { GET: handler, _testContainer } = await import('./route');

    if (_testContainer) {
      const repos = _testContainer._repos;
      await repos.teamMember.create({
        id: 'member-2',
        email: 'used@example.com',
        name: 'Used User',
        teamId: 'team-1',
      });
      await repos.magicLink.create({
        token: 'used-token-789',
        memberId: 'member-2',
        expiresAt: new Date(Date.now() + 3600000),
      });
    }

    const request1 = new Request('http://localhost/api/auth/magic-link/verify/used-token-789');
    const context1 = { params: Promise.resolve({ token: 'used-token-789' }) };

    // First use — should succeed
    const response1 = await handler(request1, context1);
    expect(response1.status).toBe(200);

    // Second use — should fail (single-use)
    const request2 = new Request('http://localhost/api/auth/magic-link/verify/used-token-789');
    const context2 = { params: Promise.resolve({ token: 'used-token-789' }) };

    const response2 = await handler(request2, context2);
    expect(response2.status).toBe(404);
  });
});
