/**
 * Property Tests for Session-Link Response Fields
 *
 * Feature: integration-hardening, Property 4: Session-link response contains all required fields
 *
 * **Validates: Requirements 3.1, 3.4**
 *
 * For any valid session link token pointing to an existing member and session with at least
 * one question defined, the response SHALL contain memberId, sessionId, memberName,
 * cadencePreference, sessionStatus, a non-empty questions array, and a responses array
 * (possibly empty). The response SHALL also include a Set-Cookie header.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { resetRateLimitStore } from '@/lib/rate-limit';
import { GET, _testRepos as repos } from './route';

/**
 * Arbitrary for member names — realistic names with some variation.
 */
const memberNameArb = fc.stringMatching(/^[A-Z][a-z]{2,10} [A-Z][a-z]{2,10}$/);

/**
 * Arbitrary for email addresses — unique per run to avoid collisions.
 */
const emailArb = fc.stringMatching(/^[a-z]{3,8}\d{1,4}@test\.com$/);

/**
 * Arbitrary for cadence preferences — valid values used by the system.
 */
const cadencePreferenceArb = fc.constantFrom('weekly', 'micro_pulse', 'session');

/**
 * Arbitrary for session-link tokens — must be unique and non-empty.
 */
const tokenArb = fc.stringMatching(/^sltoken_[a-z0-9]{16,32}$/);

/**
 * Helper to create a request for the session-link route.
 */
function makeRequest(token: string, ip = '127.0.0.1') {
  return new Request(`http://localhost/api/auth/session-link/${token}`, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

function makeContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe('Property 4: Session-link response contains all required fields', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('response contains memberId, sessionId, memberName, cadencePreference, sessionStatus, questions (non-empty), and responses (array), plus Set-Cookie header', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberNameArb,
        emailArb,
        cadencePreferenceArb,
        tokenArb,
        async (name, email, cadencePreference, token) => {
          const teamId = `team_${crypto.randomUUID().slice(0, 8)}`;
          const memberId = `mem_${crypto.randomUUID().slice(0, 12)}`;

          // Seed team member
          await repos.teamMember.create({
            id: memberId,
            teamId,
            name,
            email,
          });

          // Update cadence preference if not the default
          if (cadencePreference !== 'weekly') {
            await repos.teamMember.update(memberId, { cadencePreference });
          }

          // Seed an open session
          const session = await repos.session.create({
            teamId,
            status: 'open',
            scheduledCloseAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          });

          // Seed session link
          await repos.sessionLink.create({
            token,
            memberId,
            sessionId: session.id,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          });

          // Call the route handler
          const request = makeRequest(token);
          const response = await GET(request, makeContext(token));

          // Verify successful response
          expect(response.status).toBe(200);

          const body = await response.json();

          // Required fields
          expect(body.memberId).toBe(memberId);
          expect(body.sessionId).toBe(session.id);
          expect(body.memberName).toBe(name);
          expect(body.cadencePreference).toBe(cadencePreference);
          expect(body.sessionStatus).toBe('open');

          // Questions must be a non-empty array (InMemoryQuestionRepository always has 5)
          expect(Array.isArray(body.questions)).toBe(true);
          expect(body.questions.length).toBeGreaterThan(0);
          for (const q of body.questions) {
            expect(q).toHaveProperty('id');
            expect(q).toHaveProperty('title');
            expect(q).toHaveProperty('description');
            expect(q).toHaveProperty('displayOrder');
          }

          // Responses must be an array (possibly empty)
          expect(Array.isArray(body.responses)).toBe(true);

          // Set-Cookie header must be present
          const setCookie = response.headers.get('Set-Cookie');
          expect(setCookie).not.toBeNull();
          expect(setCookie).toContain('session=');
          expect(setCookie).toContain('HttpOnly');
        }
      ),
      { numRuns: 100 }
    );
  });
});
