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

  return { sendMagicLink };
}

/**
 * In-memory email service fake for testing.
 * Records all sent emails so tests can assert on delivery without network calls.
 */
export class InMemoryEmailService implements EmailService {
  readonly sentEmails: Array<{ to: string; token: string; baseUrl: string }> = [];

  async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    this.sentEmails.push({ to, token, baseUrl });
  }
}
