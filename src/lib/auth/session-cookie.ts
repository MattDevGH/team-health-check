/**
 * Session Cookie Helper
 * Builds Set-Cookie headers for session token management.
 *
 * Validates: Requirements 1.1, 1.5, 1.6
 */

export const COOKIE_NAME = 'session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  maxAge: number;
  secure: boolean;
  path: string;
}

/**
 * Determine cookie options based on environment.
 * Secure flag is set only in production or when serving over HTTPS.
 */
export function getCookieOptions(maxAge?: number): CookieOptions {
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://');

  return {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: maxAge ?? SESSION_MAX_AGE,
    secure: isSecure,
    path: '/',
  };
}

/**
 * Build a Set-Cookie header string for setting a session token.
 */
export function buildSetCookieHeader(token: string, maxAge?: number): string {
  const opts = getCookieOptions(maxAge);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite}`,
    'HttpOnly',
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Build a Set-Cookie header string that clears the session cookie.
 * Sets token to empty and Max-Age to 0 so the browser removes it.
 */
export function buildClearCookieHeader(): string {
  return buildSetCookieHeader('', 0);
}
