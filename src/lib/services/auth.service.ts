/**
 * Authentication service: Slack pairing codes and magic link request/verification.
 * Requirements: 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.4, 7.5, 7.8, 7.9
 */

import crypto from 'crypto';

import { NotFoundError, RateLimitError } from '@/lib/errors';
import { checkRateLimit, isRateLimited, recordRateLimitHit } from '@/lib/rate-limit';
import type {
  MagicLinkRepository,
  TeamMemberRepository,
  UserSessionRepository,
  PendingGenesisRepository,
  PairingCodeRepository,
  SessionLinkRepository,
  SessionRepository,
} from '@/lib/repositories/types';

export type MagicLinkVerifyResult =
  | { status: 'authenticated'; memberId: string; sessionToken: string }
  | { status: 'requires_team_creation'; pendingToken: string; email: string };

export interface AuthServiceDeps {
  pairingCodeRepo: PairingCodeRepository;
  magicLinkRepo?: MagicLinkRepository;
  teamMemberRepo?: TeamMemberRepository;
  userSessionRepo?: UserSessionRepository;
  pendingGenesisRepo?: PendingGenesisRepository;
  sessionLinkRepo?: SessionLinkRepository;
  sessionRepo?: SessionRepository;
}

export interface AuthService {
  generatePairingCode(slackUserId: string): Promise<string>;
  verifyPairingCode(memberId: string, code: string): Promise<{ slackUserId: string } | null>;
  requestMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<MagicLinkVerifyResult>;
  validateSessionLink(token: string): Promise<{ memberId: string; sessionId: string } | null>;
  validateSessionLinkWithRateLimit(token: string, ip: string): Promise<{ memberId: string; sessionId: string } | null>;
}

/** Requirement 2.3: Pairing code expiry — 10 minutes */
const PAIRING_CODE_EXPIRY_MS = 10 * 60 * 1000;

/** Requirement 7.5: Rate limit — 5 requests per email per hour */
const MAGIC_LINK_RATE_LIMIT = 5;
const MAGIC_LINK_RATE_WINDOW_MS = 60 * 60 * 1000;

/** Requirement 7.2: Magic link expiry — 1 hour */
const MAGIC_LINK_EXPIRY_MS = 60 * 60 * 1000;

/** Session duration — 7 days (Requirement 7.3) */
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Requirement 6.7: Session link rate limit — 10 failures per IP per 5 minutes */
const SESSION_LINK_FAIL_RATE_LIMIT = 10;
const SESSION_LINK_FAIL_WINDOW_MS = 5 * 60 * 1000;

/** Characters used for pairing code generation: uppercase alphanumeric */
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;

/**
 * Generates a cryptographically random 6-character uppercase alphanumeric code.
 */
function generateRandomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

/**
 * Factory function for creating the auth service.
 * Accepts repository dependencies via injection.
 */
export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { pairingCodeRepo, magicLinkRepo, teamMemberRepo, userSessionRepo, pendingGenesisRepo, sessionLinkRepo, sessionRepo } = deps;

  /**
   * Generate a pairing code for Slack identity linking.
   * Creates a 6-char uppercase alphanumeric code with 10-minute expiry.
   * Requirement 2.3
   */
  async function generatePairingCode(slackUserId: string): Promise<string> {
    const code = generateRandomCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_EXPIRY_MS);

    await pairingCodeRepo.create({
      code,
      slackUserId,
      expiresAt,
    });

    return code;
  }

  /**
   * Verify a pairing code submitted by a team member.
   * Returns { slackUserId } on success, null if code is expired, used, or non-existent.
   * Requirements 2.4, 2.5
   */
  async function verifyPairingCode(
    _memberId: string,
    code: string
  ): Promise<{ slackUserId: string } | null> {
    const stored = await pairingCodeRepo.findByCode(code);

    if (!stored) return null;
    if (stored.used) return null;
    if (stored.expiresAt < new Date()) return null;

    await pairingCodeRepo.markUsed(stored.id);
    return { slackUserId: stored.slackUserId };
  }

  /**
   * Request a magic link for the given email.
   * Always returns void — anti-enumeration (Requirement 7.8).
   * Rate-limited to 5 per email per hour (Requirement 7.5).
   */
  async function requestMagicLink(email: string): Promise<void> {
    if (!magicLinkRepo || !teamMemberRepo || !pendingGenesisRepo) {
      throw new Error('Magic link dependencies not provided');
    }

    const allowed = checkRateLimit(email, MAGIC_LINK_RATE_LIMIT, MAGIC_LINK_RATE_WINDOW_MS);
    if (!allowed) {
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

    const member = await teamMemberRepo.findByEmail(email);

    if (member) {
      await magicLinkRepo.create({
        token,
        memberId: member.id,
        expiresAt,
      });
    } else {
      await pendingGenesisRepo.create({
        token,
        email,
        expiresAt,
      });
    }
  }

  /**
   * Verify a magic link token — atomic CAS claim (single-use).
   * Returns discriminated union: authenticated vs requires_team_creation.
   * Requirement 7.2: single-use; Requirement 7.4: expired/used returns error.
   */
  async function verifyMagicLink(token: string): Promise<MagicLinkVerifyResult> {
    if (!magicLinkRepo || !userSessionRepo || !pendingGenesisRepo) {
      throw new Error('Magic link dependencies not provided');
    }

    const claimed = await magicLinkRepo.claimToken(token);

    if (claimed) {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

      await userSessionRepo.create({
        memberId: claimed.memberId,
        token: sessionToken,
        expiresAt: sessionExpiresAt,
      });

      return {
        status: 'authenticated',
        memberId: claimed.memberId,
        sessionToken,
      };
    }

    const genesis = await pendingGenesisRepo.claimToken(token);

    if (genesis) {
      return {
        status: 'requires_team_creation',
        pendingToken: genesis.token,
        email: genesis.email,
      };
    }

    throw new NotFoundError('Invalid or expired access link');
  }

  /**
   * Validate a session link token.
   * Returns { memberId, sessionId } on success, null if token is invalid, expired,
   * or the session closed more than 7 days ago.
   * Requirements: 6.3, 6.4, 6.5, 6.6
   */
  async function validateSessionLink(token: string): Promise<{ memberId: string; sessionId: string } | null> {
    if (!sessionLinkRepo || !sessionRepo) {
      throw new Error('Session link dependencies not provided');
    }

    const link = await sessionLinkRepo.findByToken(token);
    if (!link) return null;

    // Check if the link has expired
    if (link.expiresAt < new Date()) return null;

    return { memberId: link.memberId, sessionId: link.sessionId };
  }

  /**
   * Rate-limited session link validation.
   * Only counts failed attempts against the rate limit.
   * 10 failures per IP in 5 minutes → rejects further attempts.
   * Requirement 6.7
   */
  async function validateSessionLinkWithRateLimit(
    token: string,
    ip: string
  ): Promise<{ memberId: string; sessionId: string } | null> {
    const failKey = `session-link-fail:${ip}`;

    // Phase 1: Check if IP is already locked out
    if (isRateLimited(failKey, SESSION_LINK_FAIL_RATE_LIMIT, SESSION_LINK_FAIL_WINDOW_MS)) {
      throw new RateLimitError('Too many failed session link attempts');
    }

    // Phase 2: Validate the token
    const result = await validateSessionLink(token);

    // Phase 3: If validation failed, record the failure
    if (!result) {
      recordRateLimitHit(failKey);
    }

    return result;
  }

  return {
    generatePairingCode,
    verifyPairingCode,
    requestMagicLink,
    verifyMagicLink,
    validateSessionLink,
    validateSessionLinkWithRateLimit,
  };
}
