import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ForbiddenError } from '@/lib/errors';
import { verifySlackSignature } from './verify-signature';

const TEST_SECRET = 'test-signing-secret-abc123';

/**
 * Helper: compute a valid Slack signature for a given timestamp and body.
 */
function computeSignature(timestamp: string, body: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', TEST_SECRET);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('verifySlackSignature', () => {
  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes with a valid signature and recent timestamp', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"token":"abc","event":{"type":"message"}}';
    const signature = computeSignature(timestamp, body);

    expect(() =>
      verifySlackSignature({ signature, timestamp, body })
    ).not.toThrow();
  });

  it('throws ForbiddenError for an invalid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"token":"abc","event":{"type":"message"}}';
    const signature = 'v0=invalid_signature_value_0000000000000000000000000000000000000000';

    expect(() =>
      verifySlackSignature({ signature, timestamp, body })
    ).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when request is older than 5 minutes', () => {
    const sixMinutesAgo = String(Math.floor(Date.now() / 1000) - 360);
    const body = '{"token":"abc","event":{"type":"message"}}';
    const signature = computeSignature(sixMinutesAgo, body);

    expect(() =>
      verifySlackSignature({ signature, timestamp: sixMinutesAgo, body })
    ).toThrow(ForbiddenError);
    expect(() =>
      verifySlackSignature({ signature, timestamp: sixMinutesAgo, body })
    ).toThrow('Request too old');
  });

  it('throws ForbiddenError when body has been tampered with', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const originalBody = '{"token":"abc","event":{"type":"message"}}';
    const tamperedBody = '{"token":"abc","event":{"type":"malicious"}}';
    const signature = computeSignature(timestamp, originalBody);

    expect(() =>
      verifySlackSignature({ signature, timestamp, body: tamperedBody })
    ).toThrow(ForbiddenError);
    expect(() =>
      verifySlackSignature({ signature, timestamp, body: tamperedBody })
    ).toThrow('Invalid Slack signature');
  });

  it('accepts a request exactly at the 5-minute boundary', () => {
    const exactlyFiveMinutesAgo = String(Math.floor(Date.now() / 1000) - 300);
    const body = '{"token":"abc"}';
    const signature = computeSignature(exactlyFiveMinutesAgo, body);

    expect(() =>
      verifySlackSignature({
        signature,
        timestamp: exactlyFiveMinutesAgo,
        body,
      })
    ).not.toThrow();
  });
});
