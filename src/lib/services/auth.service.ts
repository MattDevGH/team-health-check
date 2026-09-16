/**
 * Authentication service: Slack pairing codes and magic link request/verification.
 * Requirements: 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.4, 7.5, 7.8, 7.9
 */

import crypto from 'crypto';
import { recorder } from '@/lib/observability';

import { AppError, NotFoundError, RateLimitError } from '@/lib/errors';
import { checkRateLimit, isRateLimited, recordRateLimitHit } from '@/lib/rate-limit';
import type {
  MagicLinkRepository,
  TeamMemberRepository,
  UserSessionRepository,
  PendingGenesisRepository,
  PairingCodeRepository,
  SessionLinkRepository,
  SessionRepository,
  SlackIdentityLinkRepository,
} from '@/lib/repositories/types';
import type { EmailService } from '@/lib/services/email.service';

/**
 * What a Slack sign-in request produced.
 *
 * Requirements: Slack Sign In 1.1, 1.5
 *
 * `unlinked` carries nothing about why. A workspace member is not a team
 * member, and a reply that distinguished "you are on no team" from "your Slack
 * account is not linked" would turn this command into a way of asking who is.
 */
export type SlackSignInResult =
  | { status: 'issued'; token: string }
  | { status: 'unlinked' };

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
  slackIdentityLinkRepo?: SlackIdentityLinkRepository;
  emailService?: EmailService;
}

export interface SessionLinkAuthResult {
  sessionToken: string;
  expiresAt: Date;
}

export interface AuthService {
  generatePairingCode(slackUserId: string): Promise<string>;
  verifyPairingCode(memberId: string, code: string): Promise<{ slackUserId: string } | null>;
  requestMagicLink(email: string): Promise<void>;
  requestSlackSignIn(slackUserId: string): Promise<SlackSignInResult>;
  verifyMagicLink(token: string): Promise<MagicLinkVerifyResult>;
  invalidateSession(token: string): Promise<void>;
  establishSessionLinkAuth(
    memberId: string,
    scheduledCloseAt: Date | null,
  ): Promise<SessionLinkAuthResult>;
  validateSessionLink(token: string): Promise<{ memberId: string; sessionId: string } | null>;
  validateSessionLinkWithRateLimit(token: string, ip: string): Promise<{ memberId: string; sessionId: string } | null>;
}

/** Requirement 2.3: Pairing code expiry — 10 minutes */
/**
 * How long a pairing code lasts.
 *
 * Requirements: Explaining Itself 4.4. Exported because the profile page tells
 * a member "codes expire after ten minutes", and copy that quietly stops being
 * true is worse than no copy. A test ties the two together.
 */
export const PAIRING_CODE_EXPIRY_MS = 10 * 60 * 1000;

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
  const { pairingCodeRepo, magicLinkRepo, teamMemberRepo, userSessionRepo, pendingGenesisRepo, sessionLinkRepo, sessionRepo, slackIdentityLinkRepo, emailService } = deps;

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
   * Requirements 2.4, 2.5, 7.1, 7.2
   */
  async function verifyPairingCode(
    memberId: string,
    code: string
  ): Promise<{ slackUserId: string } | null> {
    const stored = await pairingCodeRepo.findByCode(code);

    if (!stored) return null;
    if (stored.used) return null;
    if (stored.expiresAt < new Date()) return null;

    await pairingCodeRepo.markUsed(stored.id);

    // Persist Slack identity link (upsert to handle re-linking)
    if (slackIdentityLinkRepo) {
      await slackIdentityLinkRepo.upsertByMemberId(memberId, stored.slackUserId);
    }

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

    const members = await teamMemberRepo.findAllByEmail(email);

    /**
     * An email held by more than one member cannot be resolved to a person.
     *
     * The schema permits it — `TeamMember` is unique on `(teamId, name, email)`
     * — and this used to be a `findByEmail`, which answers with an arbitrary
     * one of them. That would have signed the member into whichever team the
     * query happened to return.
     *
     * No link is issued and no genesis record is created. The HTTP response is
     * unchanged, because this function returns void for every input: the
     * anti-enumeration guarantee of Requirement 7.8 costs nothing to keep here.
     */
    if (members.length > 1) {
      /*
       * One event per duplicate, rather than one line naming the address.
       *
       * The old line carried the email, which is the person; these carry the
       * member and team ids, which are already in the database and are what
       * somebody would act on anyway — a person belongs to one team, so remove
       * the duplicate member or change one address.
       */
      recorder.error('signin.ambiguous', {
        count: members.length,
        message: 'one address matches members on several teams; no magic link issued',
      });

      for (const duplicate of members) {
        recorder.error('signin.ambiguous.member', {
          memberId: duplicate.id,
          teamId: duplicate.teamId,
        });
      }

      return;
    }

    const member = members[0] ?? null;

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

    // Send email (anti-enumeration: swallow errors)
    // Requirement 6.1: Call EmailService after token persistence
    // Requirement 6.3: Swallow failures — user must not know if email succeeded
    if (emailService) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      try {
        await emailService.sendMagicLink(email, token, baseUrl);
      } catch (err) {
        /*
         * Recorded without the address, which leaves this weaker than it looks:
         * for somebody signing in to create a team there is no member id yet,
         * so the record says a magic link failed to send and cannot say to
         * whom.
         *
         * That is the cost of two promises kept elsewhere — anti-enumeration,
         * and ids rather than addresses in logs — and it is the right trade. A
         * member who reports never receiving a link can be found by their team;
         * an address in a log file cannot be taken back.
         */
        recorder.error('magic-link.delivery.failed', {
          memberId: member?.id,
          errorName: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Verify a magic link token.
   * Existing-member links are claimed here, while pending genesis records are
   * only validated. Genesis execution owns the sole CAS claim for new users.
   */
  /**
   * A sign-in link for a Slack user whose account is linked to a member.
   *
   * Requirements: Slack Sign In 1.1, 1.4, 1.5, NFR 1.2
   *
   * The token is an ordinary magic link, deliberately. A second token type
   * would mean a second expiry, a second claim, and a second place for
   * single-use to be got wrong — and the thing being carried is identical:
   * proof established elsewhere, handed to a browser that Slack cannot give a
   * cookie to.
   *
   * `slackUserId` comes from a payload whose signature the route has already
   * verified. It is never read from a request body, which is the same rule
   * that governs `AuthContext.memberId`.
   */
  async function requestSlackSignIn(slackUserId: string): Promise<SlackSignInResult> {
    if (!magicLinkRepo || !slackIdentityLinkRepo) {
      throw new Error('Slack sign-in dependencies not provided');
    }

    const link = await slackIdentityLinkRepo.findBySlackUserId(slackUserId);
    if (!link) return { status: 'unlinked' };

    const token = crypto.randomBytes(32).toString('hex');
    await magicLinkRepo.create({
      token,
      memberId: link.memberId,
      expiresAt: new Date(Date.now() + MAGIC_LINK_EXPIRY_MS),
    });

    return { status: 'issued', token };
  }

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

    const genesis = await pendingGenesisRepo.findByToken(token);
    if (!genesis || genesis.used || genesis.expiresAt <= new Date()) {
      throw new NotFoundError('Invalid or expired access link');
    }

    return {
      status: 'requires_team_creation',
      pendingToken: genesis.token,
      email: genesis.email,
    };
  }

  /** Integration Requirement 1.6: revoke the exact presented browser session. */
  async function invalidateSession(token: string): Promise<void> {
    if (!userSessionRepo) {
      throw new AppError(
        'User session repository is not configured',
        'INTERNAL_ERROR',
        500,
      );
    }

    await userSessionRepo.deleteByToken(token);
  }

  /**
   * Establish browser authentication from a session link using one effective
   * bound for persistence and the cookie. Reuse may shorten, never extend.
   */
  async function establishSessionLinkAuth(
    memberId: string,
    scheduledCloseAt: Date | null,
  ): Promise<SessionLinkAuthResult> {
    if (!userSessionRepo) {
      throw new AppError(
        'User session repository is not configured',
        'INTERNAL_ERROR',
        500,
      );
    }

    const now = Date.now();
    const existing = await userSessionRepo.findValidByMemberId(memberId);
    const deadlines = [now + SESSION_EXPIRY_MS];
    if (scheduledCloseAt) deadlines.push(scheduledCloseAt.getTime());
    if (existing) deadlines.push(existing.expiresAt.getTime());

    const maxAge = Math.max(0, Math.floor((Math.min(...deadlines) - now) / 1000));
    const expiresAt = new Date(now + maxAge * 1000);
    if (!existing) {
      const sessionToken = crypto.randomUUID();
      await userSessionRepo.create({ memberId, token: sessionToken, expiresAt });
      return { sessionToken, expiresAt };
    }

    const persisted = await userSessionRepo.shortenExpiry(existing.token, expiresAt);
    if (!persisted) {
      throw new AppError('User session disappeared during update', 'INTERNAL_ERROR', 500);
    }
    return {
      sessionToken: persisted.token,
      expiresAt: persisted.expiresAt,
    };
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
    requestSlackSignIn,
    verifyMagicLink,
    invalidateSession,
    establishSessionLinkAuth,
    validateSessionLink,
    validateSessionLinkWithRateLimit,
  };
}
