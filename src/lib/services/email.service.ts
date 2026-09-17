/**
 * Email service for sending magic link emails.
 * Uses Resend SDK for production delivery, with an in-memory fake for testing.
 * Requirements: 7.1
 */

import { Resend } from 'resend';

/**
 * Interface for email delivery services.
 * Services depend on this interface, enabling easy testing with InMemoryEmailService.
 */
export interface EmailService {
  sendMagicLink(to: string, token: string, baseUrl: string): Promise<void>;
  /**
   * Tell a member a health check has opened, and give them the way in.
   *
   * Requirements: Reaching Your Health Check 3.1, 3.3
   *
   * A second method rather than a `type` flag on the first, so the two
   * templates cannot drift into being the same one. One signs you in and the
   * other asks for your answers; a reader who cannot tell them apart will
   * click the wrong one, or ignore the one that mattered.
   *
   * `closesAt` is null for a check opened by hand, which has no scheduled
   * close. The prompt still goes — a session opened manually that silently
   * stopped telling anybody would be the same defect this spec exists to fix.
   */
  sendHealthCheckPrompt(
    to: string,
    sessionLinkToken: string,
    baseUrl: string,
    closesAt: Date | null,
  ): Promise<void>;
}

/** Payload shape for the email send function. */
export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Configuration for creating a Resend-backed email service.
 */
export interface ResendEmailServiceConfig {
  apiKey: string;
  senderAddress: string;
  /** Optional override for the send function (used in tests to avoid real API calls) */
  sendFn?: (payload: EmailPayload) => Promise<void>;
}

/**
 * Creates a Resend-backed email service.
 * Configurable via environment variables:
 * - RESEND_API_KEY: API key for Resend
 * - EMAIL_SENDER: Sender email address (e.g., "noreply@yourdomain.com")
 */
export function createResendEmailService(config: ResendEmailServiceConfig): EmailService {
  const { apiKey, senderAddress, sendFn } = config;

  const resendClient = sendFn ? null : new Resend(apiKey);

  async function sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    const magicUrl = `${baseUrl}/auth/magic/${token}`;
    const payload: EmailPayload = {
      from: senderAddress,
      to,
      subject: 'Your access link — Team Health Check',
      html: `<p>Click the link below to access Team Health Check:</p><p><a href="${magicUrl}">Access Team Health Check</a></p><p>This link expires in 1 hour and can only be used once.</p>`,
    };

    if (sendFn) {
      await sendFn(payload);
      return;
    }

    await resendClient!.emails.send(payload);
  }

  async function sendHealthCheckPrompt(
    to: string,
    sessionLinkToken: string,
    baseUrl: string,
    closesAt: Date | null,
  ): Promise<void> {
    const sessionUrl = `${baseUrl}/session/${sessionLinkToken}`;
    // The locale is pinned, as everywhere else that shows a date here
    const deadline = closesAt
      ? `<p>This check closes on ${closesAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}.</p>`
      : '';

    const payload: EmailPayload = {
      from: senderAddress,
      to,
      // Deliberately unlike the magic link's "Your access link", because the
      // subject is all some readers ever see
      subject: 'Your team health check is open — Team Health Check',
      html:
        `<p>Your team's health check is open, and your answers are wanted.</p>` +
        `<p><a href="${sessionUrl}">Answer the health check</a></p>` +
        deadline +
        `<p>You can change your answers any time before it closes.</p>`,
    };

    if (sendFn) {
      await sendFn(payload);
      return;
    }

    await resendClient!.emails.send(payload);
  }

  return { sendMagicLink, sendHealthCheckPrompt };
}

/**
 * In-memory email service fake for testing.
 * Records all sent emails so tests can assert on delivery without network calls.
 */
export class InMemoryEmailService implements EmailService {
  readonly sentEmails: Array<{ to: string; token: string; baseUrl: string }> = [];
  /**
   * Prompts, kept apart from magic links deliberately.
   *
   * One list would let a test assert "an email was sent" and pass when the
   * wrong one was — the exact shape of the reminder defect this spec cites.
   */
  readonly sentPrompts: Array<{
    to: string;
    token: string;
    baseUrl: string;
    closesAt: Date | null;
  }> = [];

  async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    this.sentEmails.push({ to, token, baseUrl });
  }

  async sendHealthCheckPrompt(
    to: string,
    token: string,
    baseUrl: string,
    closesAt: Date | null,
  ): Promise<void> {
    this.sentPrompts.push({ to, token, baseUrl, closesAt });
  }
}
