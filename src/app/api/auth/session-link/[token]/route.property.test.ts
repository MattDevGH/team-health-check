/**
 * Property Tests for Session-Link Response Fields
 *
 * Feature: integration-hardening, Property 4: Session-link response contains all required fields
 *
 * **Validates: Requirements 3.1, 3.4**
 *
 * For any valid session link token pointing to an existing member and session with at least
 * one question defined, the response SHALL contain memberId, sessionId, memberName,
 * cadencePreference, sessionStatus, cadence-selected questions, the complete allQuestions
 * expansion payload, expandable, and a responses array (possibly empty). The response
 * SHALL also include a Set-Cookie header.
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

          expect(Array.isArray(body.allQuestions)).toBe(true);
          expect(body.allQuestions).toHaveLength(5);

          // Micro-pulse receives a weighted subset plus one-call expansion data;
          // other cadences receive the full set.
          if (cadencePreference === 'micro_pulse') {
            expect(body.questions).toHaveLength(2);
            expect(body.expandable).toBe(true);
            const allIds = body.allQuestions.map((question: { id: string }) => question.id);
            for (const question of body.questions) expect(allIds).toContain(question.id);
          } else {
            expect(body.questions).toEqual(body.allQuestions);
            expect(body.expandable).toBe(false);
          }

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

  it('micro-pulse subset size and expandability match arbitrary answered and timing states', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async (answeredCount, remainingDays) => {
          const suffix = crypto.randomUUID();
          const teamId = `property-team-${suffix}`;
          const memberId = `property-member-${suffix}`;
          const token = `property-token-${suffix}`;
          await repos.teamMember.create({ id: memberId, teamId, name: 'Property Member' });
          await repos.teamMember.update(memberId, { cadencePreference: 'micro_pulse' });
          const session = await repos.session.create({
            teamId,
            status: 'open',
            scheduledCloseAt: new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000),
          });
          await repos.sessionLink.create({
            token,
            memberId,
            sessionId: session.id,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          });
          const allQuestionIds = (await repos.question.findAll()).map(question => question.id);
          const answeredIds = allQuestionIds.slice(0, answeredCount);
          for (const questionId of answeredIds) {
            await repos.response.upsert({ memberId, sessionId: session.id, questionId, score: 3 });
          }

          const response = await GET(makeRequest(token), makeContext(token));
          const body = await response.json();
          const unansweredCount = allQuestionIds.length - answeredCount;
          const expectedCount = unansweredCount === 0
            ? 0
            : Math.min(Math.ceil(unansweredCount / remainingDays), unansweredCount);
          const selectedIds = body.questions.map((question: { id: string }) => question.id);

          expect(body.allQuestions.map((question: { id: string }) => question.id))
            .toEqual(allQuestionIds);
          expect(selectedIds).toHaveLength(expectedCount);
          expect(selectedIds.every((id: string) => !answeredIds.includes(id))).toBe(true);
          expect(body.expandable).toBe(expectedCount < allQuestionIds.length);
        },
      ),
      { numRuns: 50 },
    );
  });
});


describe('Property 12: Session-link cookie is scoped', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it('uses one non-negative persisted bound across close, existing expiry, and seven days', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          closeOffsetSeconds: fc.option(
            fc.integer({ min: -60 * 60, max: 10 * 24 * 60 * 60 }),
            { nil: null },
          ),
          existingOffsetSeconds: fc.option(
            fc.integer({ min: 5, max: 10 * 24 * 60 * 60 }),
            { nil: null },
          ),
        }),
        async ({ closeOffsetSeconds, existingOffsetSeconds }) => {
          const suffix = crypto.randomUUID();
          const teamId = `scope-team-${suffix}`;
          const memberId = `scope-member-${suffix}`;
          const token = `scope-token-${suffix}`;
          const before = Date.now();
          await repos.teamMember.create({ id: memberId, teamId, name: 'Scoped Member' });
          const session = await repos.session.create({
            teamId,
            status: 'open',
            ...(closeOffsetSeconds === null
              ? {}
              : { scheduledCloseAt: new Date(before + closeOffsetSeconds * 1000) }),
          });
          await repos.sessionLink.create({
            token,
            memberId,
            sessionId: session.id,
            expiresAt: new Date(before + 60 * 60 * 1000),
          });
          const originalExistingExpiry = existingOffsetSeconds === null
            ? null
            : new Date(before + existingOffsetSeconds * 1000);
          const existing = originalExistingExpiry
            ? await repos.userSession.create({
              memberId,
              token: `existing-${suffix}`,
              expiresAt: originalExistingExpiry,
            })
            : null;

          const response = await GET(makeRequest(token), makeContext(token));
          const after = Date.now();
          const setCookie = response.headers.get('Set-Cookie');
          const cookieToken = setCookie?.match(/session=([^;]+)/)?.[1];
          const maxAge = Number(setCookie?.match(/Max-Age=(\d+)/)?.[1]);
          const persisted = await repos.userSession.findByToken(cookieToken!);
          const applicableOffsets = [7 * 24 * 60 * 60];
          if (closeOffsetSeconds !== null) applicableOffsets.push(closeOffsetSeconds);
          if (existingOffsetSeconds !== null) applicableOffsets.push(existingOffsetSeconds);
          const expectedMaxAge = Math.max(0, Math.min(...applicableOffsets));

          expect(response.status).toBe(200);
          expect(cookieToken).toBe(existing?.token ?? persisted?.token);
          expect(maxAge).toBeGreaterThanOrEqual(0);
          expect(maxAge).toBeLessThanOrEqual(expectedMaxAge);
          const elapsedSeconds = Math.ceil((after - before) / 1000);
          expect(maxAge).toBeGreaterThanOrEqual(
            Math.max(0, expectedMaxAge - elapsedSeconds - 1),
          );
          expect(persisted).not.toBeNull();
          expect(persisted!.expiresAt.getTime() - maxAge * 1000)
            .toBeGreaterThanOrEqual(before);
          expect(persisted!.expiresAt.getTime() - maxAge * 1000)
            .toBeLessThanOrEqual(after + 999);
          if (originalExistingExpiry) {
            expect(persisted!.expiresAt.getTime())
              .toBeLessThanOrEqual(originalExistingExpiry.getTime());
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});