import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { resetRateLimitStore } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';
import { InMemoryEmailService } from '@/lib/services/email.service';

describe('AuthService.generatePairingCode', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
    });
  });

  it('returns a 6-character string', async () => {
    const code = await authService.generatePairingCode('U12345');

    expect(code).toHaveLength(6);
  });

  it('returns only uppercase alphanumeric characters', async () => {
    const code = await authService.generatePairingCode('U12345');

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('stores the code with a 10-minute expiry', async () => {
    const before = Date.now();
    const code = await authService.generatePairingCode('U12345');
    const after = Date.now();

    const stored = await repos.pairingCode.findByCode(code);
    expect(stored).not.toBeNull();
    expect(stored!.slackUserId).toBe('U12345');
    expect(stored!.used).toBe(false);

    const tenMinutesMs = 10 * 60 * 1000;
    // Expiry should be ~10 minutes from now
    expect(stored!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + tenMinutesMs);
    expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(after + tenMinutesMs);
  });

  it('generates unique codes on successive calls', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const code = await authService.generatePairingCode(`U${i}`);
      codes.add(code);
    }
    // With 36^6 ≈ 2 billion possibilities, collisions in 20 attempts are astronomically unlikely
    expect(codes.size).toBe(20);
  });
});

describe('AuthService.verifyPairingCode', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds with a valid, unexpired, unused code', async () => {
    const code = await authService.generatePairingCode('USLACK123');

    const result = await authService.verifyPairingCode('member-1', code);

    expect(result).not.toBeNull();
    expect(result!.slackUserId).toBe('USLACK123');
  });

  it('marks the code as used after successful verification', async () => {
    const code = await authService.generatePairingCode('USLACK123');

    await authService.verifyPairingCode('member-1', code);

    const stored = await repos.pairingCode.findByCode(code);
    expect(stored!.used).toBe(true);
  });

  it('returns null for an expired code', async () => {
    vi.useFakeTimers();
    const now = new Date('2024-06-01T12:00:00Z');
    vi.setSystemTime(now);

    const code = await authService.generatePairingCode('USLACK123');

    // Advance time by 11 minutes (past the 10-minute expiry)
    vi.setSystemTime(new Date(now.getTime() + 11 * 60 * 1000));

    const result = await authService.verifyPairingCode('member-1', code);

    expect(result).toBeNull();
  });

  it('returns null for an already-used code', async () => {
    const code = await authService.generatePairingCode('USLACK123');

    // First verification succeeds
    const first = await authService.verifyPairingCode('member-1', code);
    expect(first).not.toBeNull();

    // Second verification fails (code already used)
    const second = await authService.verifyPairingCode('member-2', code);
    expect(second).toBeNull();
  });

  it('returns null for a non-existent code', async () => {
    const result = await authService.verifyPairingCode('member-1', 'XXXXXX');

    expect(result).toBeNull();
  });

  it('succeeds when verified just before expiry (within 10 minutes)', async () => {
    vi.useFakeTimers();
    const now = new Date('2024-06-01T12:00:00Z');
    vi.setSystemTime(now);

    const code = await authService.generatePairingCode('USLACK123');

    // Advance time by 9 minutes 59 seconds (just before expiry)
    vi.setSystemTime(new Date(now.getTime() + (9 * 60 + 59) * 1000));

    const result = await authService.verifyPairingCode('member-1', code);

    expect(result).not.toBeNull();
    expect(result!.slackUserId).toBe('USLACK123');
  });
});


describe('AuthService.verifyPairingCode — SlackIdentityLink persistence', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      slackIdentityLinkRepo: repos.slackIdentityLink,
    });
  });

  it('creates a SlackIdentityLink record on successful pairing code verification', async () => {
    const code = await authService.generatePairingCode('USLACK_ABC');

    await authService.verifyPairingCode('member-42', code);

    const link = await repos.slackIdentityLink.findByMemberId('member-42');
    expect(link).not.toBeNull();
    expect(link!.memberId).toBe('member-42');
    expect(link!.slackUserId).toBe('USLACK_ABC');
  });

  it('upserts on re-verification for same memberId (no duplicate)', async () => {
    // First pairing
    const code1 = await authService.generatePairingCode('USLACK_FIRST');
    await authService.verifyPairingCode('member-42', code1);

    // Second pairing with a different slack user
    const code2 = await authService.generatePairingCode('USLACK_SECOND');
    await authService.verifyPairingCode('member-42', code2);

    // Should only have one link for this member, with the latest slackUserId
    const link = await repos.slackIdentityLink.findByMemberId('member-42');
    expect(link).not.toBeNull();
    expect(link!.slackUserId).toBe('USLACK_SECOND');

    // Verify no duplicates by checking the old slackUserId is gone
    const oldLink = await repos.slackIdentityLink.findBySlackUserId('USLACK_FIRST');
    // The record for member-42 should now point to USLACK_SECOND
    if (oldLink) {
      // If found, it should not be for member-42
      expect(oldLink.memberId).not.toBe('member-42');
    }
  });
});

describe('AuthService.validateSessionLinkWithRateLimit', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(async () => {
    resetRateLimitStore();
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      sessionLinkRepo: repos.sessionLink,
      sessionRepo: repos.session,
    });

    // Create a team, member, and open session with session links
    await repos.teamMember.create({
      teamId: 'team-1',
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  afterEach(() => {
    resetRateLimitStore();
  });

  it('allows up to 10 failed attempts within 5 minutes', async () => {
    const ip = '192.168.1.1';

    for (let i = 0; i < 10; i++) {
      const result = await authService.validateSessionLinkWithRateLimit('invalid-token', ip);
      expect(result).toBeNull();
    }
  });

  it('throws RateLimitError on 11th failed attempt within 5 minutes', async () => {
    const ip = '192.168.1.2';

    // First 10 fail normally (return null)
    for (let i = 0; i < 10; i++) {
      await authService.validateSessionLinkWithRateLimit('invalid-token', ip);
    }

    // 11th attempt should throw RateLimitError
    await expect(
      authService.validateSessionLinkWithRateLimit('invalid-token', ip)
    ).rejects.toThrow(RateLimitError);
  });

  it('does not rate limit successful validations', async () => {
    const ip = '192.168.1.3';

    // Create a valid session link
    const link = await repos.sessionLink.create({
      token: 'valid-token-abc123def456ghi789jkl012mno',
      memberId: 'member-1',
      sessionId: 'session-1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Make 15 successful requests — none should be rate limited
    for (let i = 0; i < 15; i++) {
      const result = await authService.validateSessionLinkWithRateLimit(link.token, ip);
      expect(result).not.toBeNull();
      expect(result!.memberId).toBe('member-1');
      expect(result!.sessionId).toBe('session-1');
    }
  });

  it('rate limits different IPs independently', async () => {
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';

    // Exhaust ip1's limit
    for (let i = 0; i < 10; i++) {
      await authService.validateSessionLinkWithRateLimit('bad-token', ip1);
    }

    // ip1 is now blocked
    await expect(
      authService.validateSessionLinkWithRateLimit('bad-token', ip1)
    ).rejects.toThrow(RateLimitError);

    // ip2 should still work fine
    const result = await authService.validateSessionLinkWithRateLimit('bad-token', ip2);
    expect(result).toBeNull();
  });
});

describe('AuthService.requestMagicLink — EmailService integration', () => {
  let repos: Repositories;
  let authService: AuthService;
  let emailService: InMemoryEmailService;

  beforeEach(() => {
    resetRateLimitStore();
    repos = createInMemoryRepositories();
    emailService = new InMemoryEmailService();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      magicLinkRepo: repos.magicLink,
      teamMemberRepo: repos.teamMember,
      userSessionRepo: repos.userSession,
      pendingGenesisRepo: repos.pendingGenesis,
      emailService,
    });
  });

  afterEach(() => {
    resetRateLimitStore();
  });

  it('calls EmailService.sendMagicLink for existing members', async () => {
    // Create an existing member
    await repos.teamMember.create({
      id: 'member-email-1',
      teamId: 'team-1',
      name: 'Bob',
      email: 'bob@example.com',
    });

    await authService.requestMagicLink('bob@example.com');

    expect(emailService.sentEmails).toHaveLength(1);
    expect(emailService.sentEmails[0].to).toBe('bob@example.com');
    expect(emailService.sentEmails[0].token).toBeTruthy();
    expect(emailService.sentEmails[0].baseUrl).toBeTruthy();
  });

  it('calls EmailService.sendMagicLink for new users (pending genesis)', async () => {
    await authService.requestMagicLink('newuser@example.com');

    expect(emailService.sentEmails).toHaveLength(1);
    expect(emailService.sentEmails[0].to).toBe('newuser@example.com');
    expect(emailService.sentEmails[0].token).toBeTruthy();
    expect(emailService.sentEmails[0].baseUrl).toBeTruthy();
  });

  it('swallows email failure (anti-enumeration) — function returns normally', async () => {
    // Create an existing member
    await repos.teamMember.create({
      id: 'member-email-2',
      teamId: 'team-1',
      name: 'Carol',
      email: 'carol@example.com',
    });

    // Replace emailService with one that throws
    const failingEmailService = {
      sendMagicLink: vi.fn().mockRejectedValue(new Error('Network timeout')),
    };
    const authWithFailingEmail = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      magicLinkRepo: repos.magicLink,
      teamMemberRepo: repos.teamMember,
      userSessionRepo: repos.userSession,
      pendingGenesisRepo: repos.pendingGenesis,
      emailService: failingEmailService,
    });

    // Should NOT throw — anti-enumeration
    await expect(authWithFailingEmail.requestMagicLink('carol@example.com')).resolves.toBeUndefined();
  });

  it('includes baseUrl from NEXT_PUBLIC_APP_URL env variable', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://myapp.example.com';

    await repos.teamMember.create({
      id: 'member-email-3',
      teamId: 'team-1',
      name: 'Dave',
      email: 'dave@example.com',
    });

    await authService.requestMagicLink('dave@example.com');

    expect(emailService.sentEmails[0].baseUrl).toBe('https://myapp.example.com');

    // Cleanup
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalUrl;
    }
  });

  it('does not call EmailService when rate limited', async () => {
    await repos.teamMember.create({
      id: 'member-email-4',
      teamId: 'team-1',
      name: 'Eve',
      email: 'eve@example.com',
    });

    // Exhaust rate limit (5 per hour)
    for (let i = 0; i < 5; i++) {
      await authService.requestMagicLink('eve@example.com');
    }

    emailService.sentEmails.length = 0; // Reset tracking

    // 6th request should be rate-limited — no email sent
    await authService.requestMagicLink('eve@example.com');
    expect(emailService.sentEmails).toHaveLength(0);
  });

  it('does not call EmailService when emailService dep is not provided', async () => {
    const authWithoutEmail = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      magicLinkRepo: repos.magicLink,
      teamMemberRepo: repos.teamMember,
      userSessionRepo: repos.userSession,
      pendingGenesisRepo: repos.pendingGenesis,
      // No emailService provided
    });

    await repos.teamMember.create({
      id: 'member-email-5',
      teamId: 'team-1',
      name: 'Frank',
      email: 'frank@example.com',
    });

    // Should work fine without email service — no errors
    await expect(authWithoutEmail.requestMagicLink('frank@example.com')).resolves.toBeUndefined();
  });
});
