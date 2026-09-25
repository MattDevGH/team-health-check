/**
 * Slack request signature verification.
 * Validates incoming Slack webhook requests using HMAC-SHA256
 * with timing-safe comparison and replay attack protection.
 *
 * Requirements: Slack Sign In NFR 1.1, NFR 1.3
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

/** What a rejected caller is told, whatever the reason. See below. */
const REFUSAL = 'Invalid Slack signature';

/**
 * Verifies a Slack request signature using HMAC-SHA256.
 *
 * @throws {ForbiddenError} if the secret is unconfigured, the request is too
 * old (>5 min), or the signature is invalid.
 */
export function verifySlackSignature(params: VerifySlackSignatureParams): void {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  /**
   * Requirement: Slack Sign In NFR 1.3
   *
   * This used to read `?? ''`, and an empty HMAC key is not a weak secret but
   * a published one — anybody can compute the same digest, so a forged request
   * verified and the signature proved nothing. Every route behind this one
   * takes its identity from the payload it just "verified", so a forged
   * `/healthcheck signin` would have returned a live sign-in link.
   *
   * Empty counts as absent: a variable set to nothing is the shape a
   * misconfigured deployment actually takes, and it produces the same key.
   *
   * The caller is told what a wrong signature is told. Announcing "not
   * configured" to an unauthenticated request discloses deployment state for
   * no benefit; the operator learns the real reason from the log, which names
   * a variable and never its value.
   */
  if (!signingSecret) {
    console.error(
      'SLACK_SIGNING_SECRET is not set, so no Slack request can be verified and ' +
        'every inbound Slack route is refusing traffic. Set it from the Slack app ' +
        'under Basic Information → App Credentials.',
    );
    throw new ForbiddenError(REFUSAL);
  }

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
    throw new ForbiddenError(REFUSAL);
  }
}
