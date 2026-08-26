/**
 * Tests for the test-only magic-link capture.
 *
 * E2E sign-in currently depends on an endpoint that does not exist, so required
 * happy paths call `test.skip` and the suite reports green having proved
 * nothing. This seam replaces that with a real capture: when it is unavailable
 * the caller gets a definite failure, never a skip.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  captureMagicLink,
  clearCapturedEmails,
  createCapturingEmailService,
  isTestMode,
  latestCapturedToken,
} from './email-capture';

describe('isTestMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is enabled only for the exact string "true"', () => {
    vi.stubEnv('TEST_MODE', 'true');
    expect(isTestMode()).toBe(true);
  });

  it('is disabled when unset', () => {
    vi.stubEnv('TEST_MODE', '');
    expect(isTestMode()).toBe(false);
  });

  it('is disabled for near-miss values', () => {
    for (const value of ['1', 'yes', 'TRUE', 'on']) {
      vi.stubEnv('TEST_MODE', value);
      expect(isTestMode()).toBe(false);
    }
  });
});

describe('magic link capture', () => {
  beforeEach(() => {
    clearCapturedEmails();
  });

  it('returns null for an address that has not been sent anything', () => {
    expect(latestCapturedToken('nobody@example.invalid')).toBeNull();
  });

  it('records a token against its address', () => {
    captureMagicLink('alice@example.invalid', 'token-1');

    expect(latestCapturedToken('alice@example.invalid')).toBe('token-1');
  });

  it('keeps the most recent token when several are sent', () => {
    captureMagicLink('alice@example.invalid', 'token-1');
    captureMagicLink('alice@example.invalid', 'token-2');

    expect(latestCapturedToken('alice@example.invalid')).toBe('token-2');
  });

  it('keeps addresses separate', () => {
    captureMagicLink('alice@example.invalid', 'token-a');
    captureMagicLink('bob@example.invalid', 'token-b');

    expect(latestCapturedToken('alice@example.invalid')).toBe('token-a');
    expect(latestCapturedToken('bob@example.invalid')).toBe('token-b');
  });

  it('matches addresses case-insensitively', () => {
    captureMagicLink('Alice@Example.invalid', 'token-1');

    expect(latestCapturedToken('alice@example.invalid')).toBe('token-1');
  });
});

describe('createCapturingEmailService', () => {
  beforeEach(() => {
    clearCapturedEmails();
  });

  it('captures the token instead of sending anything', async () => {
    const service = createCapturingEmailService();

    await service.sendMagicLink('alice@example.invalid', 'tok-abc', 'http://localhost:3000');

    expect(latestCapturedToken('alice@example.invalid')).toBe('tok-abc');
  });

  it('still forwards to a delegate when one is supplied', async () => {
    const delegate = { sendMagicLink: vi.fn(async () => {}) };
    const service = createCapturingEmailService(delegate);

    await service.sendMagicLink('alice@example.invalid', 'tok-abc', 'http://localhost:3000');

    expect(delegate.sendMagicLink).toHaveBeenCalledWith(
      'alice@example.invalid',
      'tok-abc',
      'http://localhost:3000',
    );
    expect(latestCapturedToken('alice@example.invalid')).toBe('tok-abc');
  });

  it('captures even when the delegate throws, so a broken sender cannot hide the token', async () => {
    const delegate = {
      sendMagicLink: vi.fn(async () => {
        throw new Error('provider down');
      }),
    };
    const service = createCapturingEmailService(delegate);

    await service.sendMagicLink('alice@example.invalid', 'tok-abc', 'http://localhost:3000');

    expect(latestCapturedToken('alice@example.invalid')).toBe('tok-abc');
  });
});
