/**
 * Unit tests for POST /api/slack/events route handler.
 * Validates: Requirement 5.14
 *
 * Tests cover:
 * - URL verification challenge response
 * - Signature verification (rejects invalid signatures)
 * - Event callback acknowledgement
 * - Unknown payload types handled gracefully
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/slack/verify-signature', () => ({
  verifySlackSignature: vi.fn(),
}));

import { verifySlackSignature } from '@/lib/slack/verify-signature';
import { POST } from './route';

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/slack/events', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': '1234567890',
      'x-slack-signature': 'v0=valid',
      ...headers,
    },
  });
}

describe('POST /api/slack/events', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 403 when signature verification fails', async () => {
    const { ForbiddenError } = await import('@/lib/errors');
    vi.mocked(verifySlackSignature).mockImplementation(() => {
      throw new ForbiddenError('Invalid Slack signature');
    });

    const body = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('responds with challenge for url_verification payload', async () => {
    vi.mocked(verifySlackSignature).mockImplementation(() => undefined);

    const body = JSON.stringify({
      type: 'url_verification',
      challenge: 'test-challenge-token',
    });

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.challenge).toBe('test-challenge-token');
  });

  it('acknowledges event_callback with 200', async () => {
    vi.mocked(verifySlackSignature).mockImplementation(() => undefined);

    const body = JSON.stringify({
      type: 'event_callback',
      event: { type: 'app_mention', text: 'hello' },
    });

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
  });

  it('returns 200 for unknown payload types', async () => {
    vi.mocked(verifySlackSignature).mockImplementation(() => undefined);

    const body = JSON.stringify({ type: 'unknown_type' });

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
  });

  it('passes correct params to verifySlackSignature', async () => {
    vi.mocked(verifySlackSignature).mockImplementation(() => undefined);

    const body = JSON.stringify({ type: 'event_callback', event: { type: 'message' } });
    const timestamp = '1672531200';
    const signature = 'v0=abc123';

    await POST(
      makeRequest(body, {
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': signature,
      })
    );

    expect(verifySlackSignature).toHaveBeenCalledWith({
      signature,
      timestamp,
      body,
    });
  });
});
