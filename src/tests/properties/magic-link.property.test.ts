import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createAuthService } from '@/lib/services/auth.service';
import { NotFoundError } from '@/lib/errors';
import { resetRateLimitStore } from '@/lib/rate-limit';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Arbitrary for a valid email address.
 */
const emailArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
  fc.stringMatching(/^[a-z]{2,6}\.[a-z]{2,3}$/)
).map(([local, domain]) => `${local}@${domain}`);

/**
 * Arbitrary for a time offset within the valid window (0 to 59 min 59 sec).
 */
const validDelayArb = fc.integer({ min: 0, max: ONE_HOUR_MS - 1 });

/**
 * Arbitrary for a time offset past the 1-hour expiry.
 */
const expiredDelayArb = fc.integer({ min: ONE_HOUR_MS + 1, max: 3 * ONE_HOUR_MS });

describe('Magic Link Properties', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 7.2, 7.4**
   *
   * Property 15: Magic link single-use and time-bounded
   *
   * For any generated magic link, it SHALL be usable exactly once within 1 hour
   * of creation. A second access of the same token SHALL fail (throws NotFoundError),
   * and any access after 1 hour SHALL fail regardless of prior use.
   */
  describe('Property 15: Magic link single-use and time-bounded', () => {
    it('magic link claimed once within 1 hour succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(emailArb, validDelayArb, async (email, delayMs) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            magicLinkRepo: repos.magicLink,
            teamMemberRepo: repos.teamMember,
            userSessionRepo: repos.userSession,
            pendingGenesisRepo: repos.pendingGenesis,
          });

          // Create a team member so the email is "known"
          await repos.teamMember.create({
            teamId: 'team-1',
            name: 'Test Member',
            email,
          });

          // Request the magic link (stores a token internally)
          await authService.requestMagicLink(email);

          // Advance time within valid window
          vi.advanceTimersByTime(delayMs);

          // Find the token that was created
          const allLinks = (repos.magicLink as unknown as { store: Map<string, { token: string }> }).store;
          const linkEntries = [...allLinks.values()];
          const token = linkEntries[linkEntries.length - 1].token;

          // First claim should succeed
          const result = await authService.verifyMagicLink(token);
          expect(result.status).toBe('authenticated');
        }),
        { numRuns: 50 }
      );
    });

    it('magic link second claim throws NotFoundError (single-use)', async () => {
      await fc.assert(
        fc.asyncProperty(emailArb, async (email) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
          resetRateLimitStore();

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            magicLinkRepo: repos.magicLink,
            teamMemberRepo: repos.teamMember,
            userSessionRepo: repos.userSession,
            pendingGenesisRepo: repos.pendingGenesis,
          });

          // Create a team member so the email is "known"
          await repos.teamMember.create({
            teamId: 'team-1',
            name: 'Test Member',
            email,
          });

          // Request the magic link
          await authService.requestMagicLink(email);

          // Get the token
          const allLinks = (repos.magicLink as unknown as { store: Map<string, { token: string }> }).store;
          const linkEntries = [...allLinks.values()];
          const token = linkEntries[linkEntries.length - 1].token;

          // First claim succeeds
          await authService.verifyMagicLink(token);

          // Second claim should throw NotFoundError
          await expect(authService.verifyMagicLink(token)).rejects.toThrow(NotFoundError);
        }),
        { numRuns: 50 }
      );
    });

    it('magic link after 1 hour throws NotFoundError (expired)', async () => {
      await fc.assert(
        fc.asyncProperty(emailArb, expiredDelayArb, async (email, delayMs) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
          resetRateLimitStore();

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            magicLinkRepo: repos.magicLink,
            teamMemberRepo: repos.teamMember,
            userSessionRepo: repos.userSession,
            pendingGenesisRepo: repos.pendingGenesis,
          });

          // Create a team member so the email is "known"
          await repos.teamMember.create({
            teamId: 'team-1',
            name: 'Test Member',
            email,
          });

          // Request the magic link
          await authService.requestMagicLink(email);

          // Get the token
          const allLinks = (repos.magicLink as unknown as { store: Map<string, { token: string }> }).store;
          const linkEntries = [...allLinks.values()];
          const token = linkEntries[linkEntries.length - 1].token;

          // Advance time past expiry
          vi.advanceTimersByTime(delayMs);

          // Expired link should throw NotFoundError
          await expect(authService.verifyMagicLink(token)).rejects.toThrow(NotFoundError);
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Validates: Requirements 7.5, 7.8, 7.9**
   *
   * Property 34: Magic link response indistinguishability (anti-enumeration)
   *
   * For any email address — whether associated with an existing TeamMember
   * or unknown — the requestMagicLink function SHALL always return void
   * (no distinguishable response). An attacker cannot tell from the return
   * value whether an email exists in the system.
   */
  describe('Property 34: Magic link response indistinguishability (anti-enumeration)', () => {
    it('requestMagicLink returns void for all emails regardless of existence', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(emailArb, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          async (emails, knownCount) => {
            vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
            resetRateLimitStore();

            const repos = createInMemoryRepositories();
            const authService = createAuthService({
              pairingCodeRepo: repos.pairingCode,
              magicLinkRepo: repos.magicLink,
              teamMemberRepo: repos.teamMember,
              userSessionRepo: repos.userSession,
              pendingGenesisRepo: repos.pendingGenesis,
            });

            // Deduplicate emails
            const uniqueEmails = [...new Set(emails)];
            if (uniqueEmails.length < 2) return; // Need at least 2 to test both paths

            // Register only some emails as known team members
            const knownEmails = uniqueEmails.slice(0, Math.min(knownCount, uniqueEmails.length - 1));
            const unknownEmails = uniqueEmails.slice(knownEmails.length);

            for (const email of knownEmails) {
              await repos.teamMember.create({
                teamId: 'team-1',
                name: `Member ${email}`,
                email,
              });
            }

            // Request magic links for ALL emails (both known and unknown)
            for (const email of uniqueEmails) {
              const result = await authService.requestMagicLink(email);
              // The return type is void — no distinguishable response
              expect(result).toBeUndefined();
            }

            // Verify: known emails created MagicLink entries
            // Unknown emails created PendingGenesis entries
            // But from the caller's perspective, both return void
            for (const email of knownEmails) {
              const result = await authService.requestMagicLink(email);
              expect(result).toBeUndefined();
            }

            for (const email of unknownEmails) {
              const result = await authService.requestMagicLink(email);
              expect(result).toBeUndefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('requestMagicLink never throws for valid or unknown emails', async () => {
      await fc.assert(
        fc.asyncProperty(emailArb, async (email) => {
          vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
          resetRateLimitStore();

          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            magicLinkRepo: repos.magicLink,
            teamMemberRepo: repos.teamMember,
            userSessionRepo: repos.userSession,
            pendingGenesisRepo: repos.pendingGenesis,
          });

          // Don't create any team members — all emails are unknown
          // The function should still return void without throwing
          const result = await authService.requestMagicLink(email);
          expect(result).toBeUndefined();
        }),
        { numRuns: 50 }
      );
    });
  });
});
