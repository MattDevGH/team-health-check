import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';

const NOW = new Date('2026-08-22T12:00:00.000Z');
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

describe('AuthService.establishSessionLinkAuth', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      userSessionRepo: repos.userSession,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates authentication capped to seven days when no close is scheduled', async () => {
    const result = await authService.establishSessionLinkAuth('member-1', null);

    expect(result.expiresAt).toEqual(
      new Date(NOW.getTime() + SEVEN_DAYS_SECONDS * 1000),
    );
    await expect(repos.userSession.findByToken(result.sessionToken)).resolves.toMatchObject({
      memberId: 'member-1',
      expiresAt: result.expiresAt,
    });
  });

  it('persistently shortens reused authentication to an earlier health-check close', async () => {
    const originalExpiry = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const scheduledCloseAt = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const existing = await repos.userSession.create({
      memberId: 'member-1',
      token: 'existing-token',
      expiresAt: originalExpiry,
    });

    const result = await authService.establishSessionLinkAuth('member-1', scheduledCloseAt);

    expect(result).toEqual({
      sessionToken: existing.token,
      expiresAt: scheduledCloseAt,
    });
    await expect(repos.userSession.findByToken(existing.token)).resolves.toMatchObject({
      expiresAt: scheduledCloseAt,
    });
  });

  it('does not extend a reused session whose existing expiry is earlier', async () => {
    const originalExpiry = new Date(NOW.getTime() + 60 * 60 * 1000);
    const existing = await repos.userSession.create({
      memberId: 'member-1',
      token: 'earlier-token',
      expiresAt: originalExpiry,
    });

    const result = await authService.establishSessionLinkAuth(
      'member-1',
      new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    );

    expect(result.expiresAt).toEqual(originalExpiry);
    await expect(repos.userSession.findByToken(existing.token)).resolves.toMatchObject({
      expiresAt: originalExpiry,
    });
  });

  it('expires immediately without emitting a negative lifetime when close is past', async () => {
    const result = await authService.establishSessionLinkAuth(
      'member-1',
      new Date(NOW.getTime() - 1000),
    );

    expect(result.expiresAt).toEqual(NOW);
    await expect(repos.userSession.findByToken(result.sessionToken)).resolves.toMatchObject({
      expiresAt: NOW,
    });
  });
});
