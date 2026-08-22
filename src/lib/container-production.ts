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
import type { Container } from './container';

/** Production repositories backed by Prisma + SQLite */
export const repos = createPrismaRepositories(prisma);

/** Production email service backed by Resend */
const emailService = process.env.RESEND_API_KEY
  ? createResendEmailService({
      apiKey: process.env.RESEND_API_KEY,
      senderAddress: process.env.EMAIL_SENDER ?? 'noreply@team-health-check.app',
    })
  : undefined;

/** Production container with all services wired to real repositories */
export const container: Container = createContainer(repos, { emailService });
