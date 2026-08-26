/**
 * Production container singleton.
 * Route handlers import the `container` instance from this module.
 *
 * Wires the production PrismaClient → Prisma repositories → service container.
 * Cached at module scope (singleton per server process).
 *
 * Architecture: Factory injection — no DI container, just explicit wiring.
 * Requirements: (architecture)
 */

import { prisma } from './prisma';
import { createPrismaRepositories } from './repositories/prisma';
import { createContainer } from './container';
import { createResendEmailService } from './services/email.service';
import { createCapturingEmailService, isTestMode } from './test-mode/email-capture';
import type { Container } from './container';

/** Production repositories backed by Prisma + SQLite */
export const repos = createPrismaRepositories(prisma);

/** Production email service backed by Resend */
const resendEmailService = process.env.RESEND_API_KEY
  ? createResendEmailService({
      apiKey: process.env.RESEND_API_KEY,
      senderAddress: process.env.EMAIL_SENDER ?? 'noreply@team-health-check.app',
    })
  : undefined;

/**
 * Under TEST_MODE the magic-link token is captured in process so the E2E suite
 * can sign in without an inbox. Any real sender still runs behind it.
 * See src/lib/test-mode/email-capture.ts for the security caveat.
 */
const emailService = isTestMode()
  ? createCapturingEmailService(resendEmailService)
  : resendEmailService;

if (isTestMode()) {
  console.warn(
    '[test-mode] TEST_MODE=true — magic-link tokens are retrievable via /api/test/magic-link. Never enable this in a deployed environment.',
  );
}

/** Production container with all services wired to real repositories */
export const container: Container = createContainer(repos, { emailService });
