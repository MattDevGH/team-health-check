/**
 * Session Cookie Helper Tests
 * Validates: Requirements 1.1, 1.5, 1.6
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  buildSetCookieHeader,
  buildClearCookieHeader,
  COOKIE_NAME,
  SESSION_MAX_AGE,
  getCookieOptions,
} from './session-cookie';

describe('session-cookie', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('COOKIE_NAME', () => {
    it('is "session"', () => {
      expect(COOKIE_NAME).toBe('session');
    });
  });

  describe('SESSION_MAX_AGE', () => {
    it('is 7 days in seconds', () => {
      expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('getCookieOptions', () => {
    it('returns httpOnly true', () => {
      const opts = getCookieOptions();
      expect(opts.httpOnly).toBe(true);
    });

    it('returns sameSite lax', () => {
      const opts = getCookieOptions();
      expect(opts.sameSite).toBe('lax');
    });

    it('returns path /', () => {
      const opts = getCookieOptions();
      expect(opts.path).toBe('/');
    });

    it('defaults maxAge to SESSION_MAX_AGE', () => {
      const opts = getCookieOptions();
      expect(opts.maxAge).toBe(SESSION_MAX_AGE);
    });

    it('accepts a custom maxAge', () => {
      const opts = getCookieOptions(3600);
      expect(opts.maxAge).toBe(3600);
    });

    it('sets secure false in non-production with http URL', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
      const opts = getCookieOptions();
      expect(opts.secure).toBe(false);
    });

    it('sets secure true when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
      const opts = getCookieOptions();
      expect(opts.secure).toBe(true);
    });

    it('sets secure true when NEXT_PUBLIC_APP_URL starts with https://', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://my-app.vercel.app');
      const opts = getCookieOptions();
      expect(opts.secure).toBe(true);
    });

    it('sets secure false when NEXT_PUBLIC_APP_URL is not set and NODE_ENV is not production', () => {
      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.NEXT_PUBLIC_APP_URL;
      const opts = getCookieOptions();
      expect(opts.secure).toBe(false);
    });
  });

  describe('buildSetCookieHeader', () => {
    it('includes the cookie name and token', () => {
      const header = buildSetCookieHeader('abc123');
      expect(header).toContain('session=abc123');
    });

    it('includes Path=/', () => {
      const header = buildSetCookieHeader('token');
      expect(header).toContain('Path=/');
    });

    it('includes Max-Age defaulting to 7 days', () => {
      const header = buildSetCookieHeader('token');
      expect(header).toContain(`Max-Age=${SESSION_MAX_AGE}`);
    });

    it('includes custom Max-Age when provided', () => {
      const header = buildSetCookieHeader('token', 3600);
      expect(header).toContain('Max-Age=3600');
    });

    it('includes SameSite=lax', () => {
      const header = buildSetCookieHeader('token');
      expect(header).toContain('SameSite=lax');
    });

    it('includes HttpOnly', () => {
      const header = buildSetCookieHeader('token');
      expect(header).toContain('HttpOnly');
    });

    it('does NOT include Secure in non-production http environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
      const header = buildSetCookieHeader('token');
      expect(header).not.toContain('Secure');
    });

    it('includes Secure when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const header = buildSetCookieHeader('token');
      expect(header).toContain('Secure');
    });

    it('includes Secure when NEXT_PUBLIC_APP_URL starts with https://', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
      const header = buildSetCookieHeader('token');
      expect(header).toContain('Secure');
    });

    it('parts are separated by "; "', () => {
      const header = buildSetCookieHeader('token');
      const parts = header.split('; ');
      expect(parts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('buildClearCookieHeader', () => {
    it('sets the token to empty string', () => {
      const header = buildClearCookieHeader();
      expect(header).toContain('session=');
      // Ensure token is empty (the value after = should be empty before the next ;)
      expect(header.startsWith('session=;') || header.startsWith('session=; ')).toBe(true);
    });

    it('sets Max-Age to 0', () => {
      const header = buildClearCookieHeader();
      expect(header).toContain('Max-Age=0');
    });

    it('retains HttpOnly and SameSite attributes', () => {
      const header = buildClearCookieHeader();
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=lax');
    });
  });
});
