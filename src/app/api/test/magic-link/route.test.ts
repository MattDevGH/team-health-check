/**
 * Tests for GET /api/test/magic-link.
 *
 * The endpoint exists so E2E sign-in can retrieve a magic-link token without an
 * inbox. It hands out live authentication tokens, so its guard matters as much
 * as its function.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { GET } from './route';
import { captureMagicLink, clearCapturedEmails } from '@/lib/test-mode/email-capture';

function request(email?: string): Request {
  const url = new URL('http://localhost/api/test/magic-link');
  if (email !== undefined) url.searchParams.set('email', email);
  return new Request(url);
}

describe('GET /api/test/magic-link', () => {
  beforeEach(() => {
    clearCapturedEmails();
    vi.stubEnv('TEST_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is invisible when TEST_MODE is not enabled', async () => {
    vi.stubEnv('TEST_MODE', '');
    captureMagicLink('alice@example.invalid', 'tok-1');

    const res = await GET(request('alice@example.invalid'));

    expect(res.status).toBe(404);
    // Must not leak the token even though one was captured in this process
    expect(await res.text()).not.toContain('tok-1');
  });

  it('returns the captured token for a known address', async () => {
    captureMagicLink('alice@example.invalid', 'tok-1');

    const res = await GET(request('alice@example.invalid'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'tok-1' });
  });

  it('rejects a request with no email', async () => {
    const res = await GET(request());

    expect(res.status).toBe(400);
  });

  it('reports a definite failure when nothing was captured', async () => {
    const res = await GET(request('nobody@example.invalid'));

    // 404 with an explicit reason: the caller must fail, not skip
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(String(body.error?.message ?? '')).toMatch(/no magic link/i);
  });

  it('does not leak tokens belonging to another address', async () => {
    captureMagicLink('alice@example.invalid', 'tok-alice');

    const res = await GET(request('bob@example.invalid'));

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('tok-alice');
  });
});
