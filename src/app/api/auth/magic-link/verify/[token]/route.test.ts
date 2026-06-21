import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

// Requirements: 7.2, 7.4, 7.9

describe('GET /api/auth/magic-link/verify/[token]', () => {
  let GET: typeof import('./route').GET;
  let repos: ReturnType<typeof createInMemoryRepositories>;

  beforeEach(async () => {
    const mod = await import('./route');
    GET = mod.GET;
    // We need repos to seed test data — grab the module-level repos
    // For route tests, we rely on the route's internal container
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
