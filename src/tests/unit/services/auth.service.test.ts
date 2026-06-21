import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';
import { resetRateLimitStore } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';

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
