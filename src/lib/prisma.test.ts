/**
 * Tests for environment-aware Prisma client initialization.
 * Validates: Requirements 13.1, 13.2, 13.5
 *
 * Strategy: We test the exported `createPrismaClient` factory by inspecting the
 * resulting PrismaClient instance. Rather than mocking internal require() calls
 * (which vitest struggles with for CJS packages), we verify the behavior by
 * checking the client is created without errors under each env configuration.
 *
 * LIMITATION: constructing a PrismaClient succeeds even when the adapter is
 * misconfigured, because nothing connects until the first query. These tests
 * passed throughout a period when the libSQL adapter was built from a client
 * instead of a config, so every production query would have failed with
 * URL_INVALID. Execution coverage of that path lives in
 * `src/tests/integration/libsql-repository.test.ts`, which runs real queries
 * through the adapter against a local file — keep it in step with this file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('src/lib/prisma.ts - environment-aware initialization', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    // Clean up globalThis singleton
    const g = globalThis as unknown as { prisma: unknown };
    delete g.prisma;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('when TURSO_DATABASE_URL is not set → uses default PrismaClient (better-sqlite3)', async () => {
    delete process.env.TURSO_DATABASE_URL;

    const { createPrismaClient } = await import('./prisma');
    const client = createPrismaClient();

    // PrismaClient created successfully with better-sqlite3 adapter
    expect(client).toBeDefined();
    // Verify it's a PrismaClient instance (has typical Prisma methods)
    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
  });

  it('when TURSO_DATABASE_URL is set → creates libSQL adapter client', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://test-db.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-auth-token';

    const { createPrismaClient } = await import('./prisma');
    const client = createPrismaClient();

    // PrismaClient created successfully with libSQL adapter
    expect(client).toBeDefined();
    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
  });

  it('when TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is not → creates client with undefined authToken', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://test-db.turso.io';
    delete process.env.TURSO_AUTH_TOKEN;

    const { createPrismaClient } = await import('./prisma');

    // Should not throw - authToken is optional for local libsql
    const client = createPrismaClient();
    expect(client).toBeDefined();
    expect(typeof client.$connect).toBe('function');
  });

  it('exported prisma preserves singleton pattern in non-production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    delete process.env.TURSO_DATABASE_URL;

    const { prisma } = await import('./prisma');

    // Verify the global was set (singleton pattern)
    const globalForPrisma = globalThis as unknown as { prisma: unknown };
    expect(globalForPrisma.prisma).toBe(prisma);
  });

  it('exported prisma does not cache to globalThis in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.TURSO_DATABASE_URL;

    const g = globalThis as unknown as { prisma: unknown };
    delete g.prisma;

    await import('./prisma');

    // In production the singleton cache should NOT be set
    expect(g.prisma).toBeUndefined();
  });

  it('createPrismaClient is deterministic based on TURSO_DATABASE_URL presence', async () => {
    // Without TURSO - should work (dev mode)
    delete process.env.TURSO_DATABASE_URL;
    const mod1 = await import('./prisma');
    const devClient = mod1.createPrismaClient();
    expect(devClient).toBeDefined();

    // Reset and set TURSO - should also work (prod mode)
    vi.resetModules();
    const g = globalThis as unknown as { prisma: unknown };
    delete g.prisma;
    process.env.TURSO_DATABASE_URL = 'libsql://test-db.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'token';

    const mod2 = await import('./prisma');
    const prodClient = mod2.createPrismaClient();
    expect(prodClient).toBeDefined();

    // Both are PrismaClient but from different adapters
    expect(typeof devClient.$connect).toBe('function');
    expect(typeof prodClient.$connect).toBe('function');
  });
});
