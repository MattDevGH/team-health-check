/**
 * Test-only magic-link capture.
 *
 * E2E sign-in needs the magic-link token without an inbox. Capturing it in
 * process is preferable to the previous arrangement, where the tests asked a
 * token endpoint that was never built and called `test.skip` when it 404'd — a
 * suite that reports green while proving nothing.
 *
 * SECURITY: this records live authentication tokens, so it is inert unless
 * TEST_MODE is exactly "true". Never set TEST_MODE in a deployed environment;
 * doing so would expose sign-in tokens through the capture endpoint. The
 * production container only substitutes this service when the flag is set, and
 * `src/app/api/test/magic-link/route.ts` 404s without it.
 *
 * Requirements: 10.2, 10.5, 10.6
 */

import type { EmailService } from '@/lib/services/email.service';

/** True only for the exact string "true" — no truthy coercion. */
export function isTestMode(): boolean {
  return process.env.TEST_MODE === 'true';
}

/** Latest token per address, lowercased. Process-local; never persisted. */
const capturedTokens = new Map<string, string>();

export function captureMagicLink(email: string, token: string): void {
  capturedTokens.set(email.trim().toLowerCase(), token);
}

export function latestCapturedToken(email: string): string | null {
  return capturedTokens.get(email.trim().toLowerCase()) ?? null;
}

export function clearCapturedEmails(): void {
  capturedTokens.clear();
}

/**
 * Wraps an optional real email service, recording the token either way.
 *
 * A delegate failure must not lose the capture: the E2E run still needs to
 * proceed, and swallowing the error here matches the anti-enumeration behaviour
 * of the magic-link request path.
 */
export function createCapturingEmailService(delegate?: EmailService): EmailService {
  return {
    async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
      captureMagicLink(to, token);

      if (!delegate) return;

      try {
        await delegate.sendMagicLink(to, token, baseUrl);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error(`[test-mode] delegate email send failed: ${message}`);
      }
    },
  };
}
