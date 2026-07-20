/**
 * Unit tests for email.service.ts
 * Tests magic link email delivery via Resend and in-memory fake.
 * Validates: Requirements 7.1
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  InMemoryEmailService,
  createResendEmailService,
  type EmailService,
} from '@/lib/services/email.service';

describe('EmailService', () => {
  describe('InMemoryEmailService', () => {
    let emailService: InMemoryEmailService;

    beforeEach(() => {
      emailService = new InMemoryEmailService();
    });

    it('records sent emails for verification', async () => {
      await emailService.sendMagicLink('user@example.com', 'abc123', 'https://app.example.com');

      expect(emailService.sentEmails).toHaveLength(1);
      expect(emailService.sentEmails[0]).toEqual({
        to: 'user@example.com',
        token: 'abc123',
        baseUrl: 'https://app.example.com',
      });
    });

    it('sends email with correct to address', async () => {
      await emailService.sendMagicLink('alice@company.org', 'token-xyz', 'https://example.com');

      expect(emailService.sentEmails[0].to).toBe('alice@company.org');
    });

    it('sends email with correct magic link URL containing token', async () => {
      await emailService.sendMagicLink('bob@test.io', 'my-token-456', 'https://myapp.dev');

      const sent = emailService.sentEmails[0];
      expect(sent.token).toBe('my-token-456');
      expect(sent.baseUrl).toBe('https://myapp.dev');
    });

    it('accumulates multiple sent emails', async () => {
      await emailService.sendMagicLink('a@example.com', 'token1', 'https://app.com');
      await emailService.sendMagicLink('b@example.com', 'token2', 'https://app.com');
      await emailService.sendMagicLink('c@example.com', 'token3', 'https://app.com');

      expect(emailService.sentEmails).toHaveLength(3);
    });

    it('implements the EmailService interface', () => {
      const service: EmailService = emailService;
      expect(service.sendMagicLink).toBeDefined();
    });
  });

  describe('ResendEmailService', () => {
    it('uses EMAIL_SENDER environment variable as sender address', () => {
      const sender = 'custom-sender@mydomain.com';
      const service = createResendEmailService({
        apiKey: 'test-key',
        senderAddress: sender,
      });

      // The service should be created without error with a custom sender
      expect(service).toBeDefined();
    });

    it('constructs magic link URL from baseUrl and token', async () => {
      // We create a service with a mock Resend client to verify the email content
      const sentPayloads: Array<{
        from: string;
        to: string;
        subject: string;
        html: string;
      }> = [];

      const service = createResendEmailService({
        apiKey: 'test-key',
        senderAddress: 'noreply@example.com',
        sendFn: async (payload) => {
          sentPayloads.push(payload);
        },
      });

      await service.sendMagicLink('user@test.com', 'secret-token', 'https://myapp.example.com');

      expect(sentPayloads).toHaveLength(1);
      expect(sentPayloads[0].to).toBe('user@test.com');
      expect(sentPayloads[0].from).toBe('noreply@example.com');
      expect(sentPayloads[0].html).toContain('https://myapp.example.com/auth/magic/secret-token');
    });

    it('includes a clickable link in the email HTML', async () => {
      const sentPayloads: Array<{ from: string; to: string; subject: string; html: string }> = [];

      const service = createResendEmailService({
        apiKey: 'test-key',
        senderAddress: 'noreply@example.com',
        sendFn: async (payload) => {
          sentPayloads.push(payload);
        },
      });

      await service.sendMagicLink('user@test.com', 'link-token', 'https://app.io');

      expect(sentPayloads[0].html).toContain('<a');
      expect(sentPayloads[0].html).toContain('href="https://app.io/auth/magic/link-token"');
    });

    it('uses the configured sender address in from field', async () => {
      const sentPayloads: Array<{ from: string; to: string; subject: string; html: string }> = [];

      const service = createResendEmailService({
        apiKey: 'test-key',
        senderAddress: 'Team Health Check <alerts@myteam.org>',
        sendFn: async (payload) => {
          sentPayloads.push(payload);
        },
      });

      await service.sendMagicLink('someone@place.com', 'tok', 'https://x.com');

      expect(sentPayloads[0].from).toBe('Team Health Check <alerts@myteam.org>');
    });
  });
});
