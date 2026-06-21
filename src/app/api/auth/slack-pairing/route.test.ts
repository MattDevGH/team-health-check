/**
 * Tests for POST /api/auth/slack-pairing
 * Requirements: 2.4, 2.5 — Slack pairing code verification
 *
 * Since the route uses a module-level in-memory container, we test through
 * the route handler interface. We generate pairing codes via the auth service
 * exposed by the same container the route uses.
 */

import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { container } from './route';

// Requirements: 2.4, 2.5

describe('POST /api/auth/slack-pairing', () => {
  it('returns linked:true with slackUserId for valid pairing code', async () => {
    // Generate a pairing code via the service (same container the route uses)
    const code = await container.auth.generatePairingCode('U12345');

    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, memberId: 'member-1' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.linked).toBe(true);
    expect(body.slackUserId).toBe('U12345');
  });

  it('returns 404 for invalid pairing code', async () => {
    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INVALID', memberId: 'member-1' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for already-used pairing code', async () => {
    const code = await container.auth.generatePairingCode('U99999');

    // First use — should succeed
    const firstRequest = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, memberId: 'member-1' }),
    });
    const firstResponse = await POST(firstRequest);
    expect(firstResponse.status).toBe(200);

    // Second use — should fail as already used
    const secondRequest = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, memberId: 'member-2' }),
    });
    const secondResponse = await POST(secondRequest);
    expect(secondResponse.status).toBe(404);

    const body = await secondResponse.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when code is missing', async () => {
    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'member-1' }),
    });

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

  it('returns 400 when memberId is missing', async () => {
    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABC123' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'memberId' }),
      ])
    );
  });

  it('returns 400 when code is not a string', async () => {
    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 123, memberId: 'member-1' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when memberId is not a string', async () => {
    const request = new Request('http://localhost/api/auth/slack-pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ABC123', memberId: 42 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
