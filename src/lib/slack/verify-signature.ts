/**
 * Slack request signature verification.
 * Validates incoming Slack webhook requests using HMAC-SHA256
 * with timing-safe comparison and replay attack protection.
 *
 * Requirement: 5.6 (implicit security)
 */
import crypto from 'node:crypto';

import { ForbiddenError } from '@/lib/errors';

const MAX_REQUEST_AGE_SECONDS = 300; // 5 minutes

export interface VerifySlackSignatureParams {
  /** x-slack-signature header value */
  signature: string;
  /** x-slack-request-timestamp header value */
  timestamp: string;
  /** Raw request body string */
  body: string;
}

/**
 * Verifies a Slack request signature using HMAC-SHA256.
 *
 * @throws {ForbiddenError} if the request is too old (>5 min) or the signature is invalid.
 */
export function verifySlackSignature(params: VerifySlackSignatureParams): void {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? '';

  // 1. Replay protection: reject requests older than 5 minutes
  const requestTime = parseInt(params.timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - requestTime) > MAX_REQUEST_AGE_SECONDS) {
    throw new ForbiddenError('Request too old');
  }

  // 2. Compute expected signature: v0=HMAC-SHA256(signing_secret, "v0:{timestamp}:{body}")
  const sigBasestring = `v0:${params.timestamp}:${params.body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  // 3. Timing-safe comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(params.signature, 'utf8');

  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new ForbiddenError('Invalid Slack signature');
  }
}
