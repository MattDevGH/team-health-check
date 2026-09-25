import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ForbiddenError } from '@/lib/errors';
import { verifySlackSignature } from './verify-signature';

const TEST_SECRET = 'test-signing-secret-abc123';

/**
 * Helper: compute the signature Slack would send for a given signing key.
 * Takes the key explicitly so a test can forge one the way an attacker would,
 * from a key they already know.
 */
function signWith(secret: string, timestamp: string, body: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

/** Helper: compute a valid Slack signature for a given timestamp and body. */
function computeSignature(timestamp: string, body: string): string {
  return signWith(TEST_SECRET, timestamp, body);
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

  /**
   * Requirement: Slack Sign In NFR 1.3
   *
   * The secret used to be read as `process.env.SLACK_SIGNING_SECRET ?? ''`, so
   * a deployment without it computed every HMAC from an empty key. An empty key
   * is not a weak secret but a published one: the forger below knows it without
   * being told, because there is nothing to know.
   *
   * These assert the request is refused, not which branch refused it — a guard
   * that rejects for the wrong reason still rejects, and one that stops
   * rejecting is what this is here to catch.
   */
  describe('when the signing secret is missing', () => {
    const BODY = 'command=%2Fhealthcheck&text=signin&user_id=U0FORGED';

    it('refuses a request forged with an empty key when the variable is blank', () => {
      vi.stubEnv('SLACK_SIGNING_SECRET', '');
      const timestamp = String(Math.floor(Date.now() / 1000));

      expect(() =>
        verifySlackSignature({ signature: signWith('', timestamp, BODY), timestamp, body: BODY })
      ).toThrow(ForbiddenError);
    });

    it('refuses a request forged with an empty key when the variable is unset', () => {
      vi.stubEnv('SLACK_SIGNING_SECRET', undefined);
      const timestamp = String(Math.floor(Date.now() / 1000));

      expect(() =>
        verifySlackSignature({ signature: signWith('', timestamp, BODY), timestamp, body: BODY })
      ).toThrow(ForbiddenError);
    });

    it('refuses even a signature Slack itself would have sent', () => {
      // The real secret exists in Slack; this deployment simply does not have it.
      // Nothing should verify here, including traffic that is entirely genuine.
      vi.stubEnv('SLACK_SIGNING_SECRET', undefined);
      const timestamp = String(Math.floor(Date.now() / 1000));

      expect(() =>
        verifySlackSignature({
          signature: signWith(TEST_SECRET, timestamp, BODY),
          timestamp,
          body: BODY,
        })
      ).toThrow(ForbiddenError);
    });
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
