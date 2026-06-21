import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createAuthService } from '@/lib/services/auth.service';

/**
 * Arbitrary for generating random strings (1-100 chars) that were never issued as tokens.
 * Uses printable ASCII characters to simulate arbitrary user input.
 */
const randomTokenArb = fc.string({ minLength: 1, maxLength: 100 });

describe('Session Link Token Properties', () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * Property 14: Invalid session link tokens return 404
   *
   * For any random string that was not generated as a session link token,
   * accessing it SHALL return null (which the API layer translates to HTTP 404)
   * with a generic error message that does not reveal proximity to valid tokens.
   */
  describe('Property 14: Invalid session link tokens return 404', () => {
    it('random strings that were never issued as tokens return null', async () => {
      await fc.assert(
        fc.asyncProperty(randomTokenArb, async (token) => {
          const repos = createInMemoryRepositories();
          const authService = createAuthService({
            pairingCodeRepo: repos.pairingCode,
            sessionLinkRepo: repos.sessionLink,
            sessionRepo: repos.session,
          });

          // Token was never issued, so validateSessionLink must return null
          const result = await authService.validateSessionLink(token);
          expect(result).toBeNull();
        }),
        { numRuns: 200 }
      );
    });

    it('random strings return null even when valid links exist in the system', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(randomTokenArb, { minLength: 1, maxLength: 10 }),
          async (tokens) => {
            const repos = createInMemoryRepositories();
            const authService = createAuthService({
              pairingCodeRepo: repos.pairingCode,
              sessionLinkRepo: repos.sessionLink,
              sessionRepo: repos.session,
            });

            // Create a valid session link in the system
            const team = await repos.team.create({ name: 'Test Team' });
            const member = await repos.teamMember.create({
              teamId: team.id,
              name: 'Test Member',
              email: 'test@example.com',
            });
            const session = await repos.session.create({
              teamId: team.id,
              status: 'open',
            });

            // Create a real session link with a known crypto token
            const realToken = 'a'.repeat(64); // deterministic token that won't collide with random strings easily
            await repos.sessionLink.create({
              token: realToken,
              memberId: member.id,
              sessionId: session.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });

            // Verify the real token works
            const validResult = await authService.validateSessionLink(realToken);
            expect(validResult).not.toBeNull();
            expect(validResult!.memberId).toBe(member.id);
            expect(validResult!.sessionId).toBe(session.id);

            // All random tokens that are not the real token must return null
            for (const randomToken of tokens) {
              if (randomToken === realToken) continue; // skip if randomly matches
              const result = await authService.validateSessionLink(randomToken);
              expect(result).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
