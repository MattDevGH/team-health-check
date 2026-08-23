import { beforeEach, describe, expect, it } from 'vitest';

import type { UserSessionRepository } from '../types';
import { InMemoryUserSessionRepository } from './user-session.repository';

describe('InMemoryUserSessionRepository.shortenExpiry', () => {
  let repository: UserSessionRepository;

  beforeEach(() => {
    repository = new InMemoryUserSessionRepository();
  });

  it('persists an earlier expiry for the exact token', async () => {
    const originalExpiry = new Date('2026-09-01T12:00:00.000Z');
    const earlierExpiry = new Date('2026-08-25T12:00:00.000Z');
    await repository.create({
      memberId: 'member-1',
      token: 'shorten-me',
      expiresAt: originalExpiry,
    });

    const shortened = await repository.shortenExpiry('shorten-me', earlierExpiry);

    expect(shortened?.expiresAt).toEqual(earlierExpiry);
    await expect(repository.findByToken('shorten-me')).resolves.toMatchObject({
      expiresAt: earlierExpiry,
    });
  });

  it('never extends an existing earlier expiry', async () => {
    const originalExpiry = new Date('2026-08-25T12:00:00.000Z');
    await repository.create({
      memberId: 'member-1',
      token: 'keep-earlier',
      expiresAt: originalExpiry,
    });

    const unchanged = await repository.shortenExpiry(
      'keep-earlier',
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(unchanged?.expiresAt).toEqual(originalExpiry);
  });

  it('returns null for an unknown token', async () => {
    await expect(
      repository.shortenExpiry('unknown', new Date('2026-08-25T12:00:00.000Z')),
    ).resolves.toBeNull();
  });
});


describe('InMemoryUserSessionRepository.findValidByMemberId', () => {
  it('selects the latest-expiring active session to match production reuse', async () => {
    const repository = new InMemoryUserSessionRepository();
    await repository.create({
      memberId: 'member-1',
      token: 'shorter-token',
      expiresAt: new Date('2099-08-25T12:00:00.000Z'),
    });
    const later = await repository.create({
      memberId: 'member-1',
      token: 'later-token',
      expiresAt: new Date('2099-09-01T12:00:00.000Z'),
    });

    await expect(repository.findValidByMemberId('member-1')).resolves.toEqual(later);
  });
});