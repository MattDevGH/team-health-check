# Implementation Plan: Integration Hardening

## Overview

This plan closes the integration gaps between the Team Health Check application's layers. The 811 passing unit/property tests prove each service works in isolation; these tasks wire the layers together so a real browser flow works end-to-end. The architecture (factory injection, repository pattern, thin route handlers) remains unchanged — we're completing the integration contracts.

All tasks follow TDD (Red → Green → Refactor) and reference specific requirements and correctness properties from the design document.

## Tasks

- [x] 1. Session cookie helper and auth foundation
  - [x] 1.1 Implement session cookie helper (`src/lib/auth/session-cookie.ts`)
    - Write failing tests for `buildSetCookieHeader` and `buildClearCookieHeader`
    - Implement cookie builder: HttpOnly, SameSite=Lax, Max-Age, Secure only when production/HTTPS
    - Export `COOKIE_NAME`, `SESSION_MAX_AGE`, `getCookieOptions`
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 1.2 Write property test for cookie attributes (Property 1)
    - **Property 1: Cookie attributes are environment-correct**
    - Generate random env configurations (NODE_ENV, NEXT_PUBLIC_APP_URL), verify HttpOnly + SameSite=Lax + positive Max-Age always present; Secure iff production or HTTPS URL
    - **Validates: Requirements 1.1, 1.5**

  - [x] 1.3 Implement auth helper (`src/lib/auth/with-auth.ts`)
    - Write failing tests for `getAuthContext` (valid token → memberId, missing/expired/invalid → null)
    - Write failing tests for `withAuth` wrapper (returns 401 JSON when no auth)
    - Implement `getAuthContext`: extract cookie, query UserSession, check expiry
    - Implement `withAuth`: higher-order function wrapping route handlers
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 2.8_

  - [x] 1.4 Write property test for auth session resolution (Property 2)
    - **Property 2: Auth helper resolves valid sessions**
    - Generate random UserSession records with future expiresAt, verify `getAuthContext` returns correct memberId
    - **Validates: Requirements 1.2, 1.3, 2.2**

  - [x] 1.5 Write property test for auth session rejection (Property 3)
    - **Property 3: Auth helper rejects invalid sessions**
    - Generate requests with missing cookies, unknown tokens, expired tokens; verify `getAuthContext` returns null
    - **Validates: Requirements 1.4, 2.6, 9.3**

- [x] 2. Checkpoint — Cookie and auth foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Team membership authorization
  - [x] 3.1 Implement team membership authorization (`src/lib/auth/authorize-team-member.ts`)
    - Write failing tests for `authorizeTeamMember` (member belongs → pass, not belongs → ForbiddenError)
    - Write failing tests for `authorizeDeliveryManager` (has role → pass, missing role → ForbiddenError)
    - Implement using repository lookups (teamMember, teamMemberRole)
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 3.2 Write property test for team membership authorization (Property 11)
    - **Property 11: Team membership authorization**
    - Generate random member/team combinations; verify 403 when teamId mismatch, allow when match
    - **Validates: Requirements 9.1, 9.2**

- [x] 4. SlackIdentityLink repository
  - [x] 4.1 Add `SlackIdentityLinkRepository` interface to `src/lib/repositories/types.ts`
    - Define create, findByMemberId, findBySlackUserId, upsertByMemberId, delete methods
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.2 Implement in-memory SlackIdentityLink repository (`src/lib/repositories/in-memory/slack-identity-link.repository.ts`)
    - Write failing tests for all CRUD operations and upsert idempotency
    - Implement in-memory fake for testing
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.3 Implement Prisma SlackIdentityLink repository (`src/lib/repositories/prisma/slack-identity-link.repository.ts`)
    - Implement Prisma-backed version matching the interface
    - Register in `src/lib/repositories/prisma/index.ts`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.4 Register SlackIdentityLink in container and repository index
    - Add `slackIdentityLink` to `Repositories` interface in `src/lib/repositories/index.ts`
    - Wire in `src/lib/container.ts` and `src/lib/container-production.ts`
    - _Requirements: 7.1, 7.3_

  - [x] 4.5 Write property test for SlackIdentityLink upsert idempotency (Property 9)
    - **Property 9: SlackIdentityLink upsert is idempotent**
    - Generate sequences of upsert calls for same memberId; verify exactly one record exists with latest slackUserId
    - **Validates: Requirements 7.2**

  - [x] 4.6 Write property test for Slack user ID resolution (Property 10)
    - **Property 10: Slack user ID resolution from repository**
    - Generate random SlackIdentityLink records; verify findBySlackUserId returns correct memberId; unknown IDs return null
    - **Validates: Requirements 7.3**

- [x] 5. Checkpoint — Repository and authorization layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. AuthService integration (email + Slack identity persistence)
  - [x] 6.1 Wire EmailService into AuthService
    - Write failing test: `requestMagicLink` calls `EmailService.sendMagicLink` for existing members
    - Write failing test: email failure is swallowed (anti-enumeration), function returns normally
    - Update `AuthServiceDeps` interface to accept optional `emailService`
    - Implement: call emailService after token persistence, catch and log errors
    - Update factory in `src/lib/container.ts` and `src/lib/container-production.ts` to inject `ResendEmailService`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.2 Write property test for magic link email delivery (Property 7)
    - **Property 7: Magic link request triggers email delivery**
    - Generate random emails mapping to existing members (not rate-limited); verify exactly one EmailService call with correct args
    - **Validates: Requirements 6.1, 6.2**

  - [x] 6.3 Wire SlackIdentityLink persistence into AuthService `verifyPairingCode`
    - Write failing test: successful pairing code verification creates SlackIdentityLink record
    - Write failing test: re-verification for same memberId upserts (no duplicate)
    - Update `AuthServiceDeps` to accept optional `slackIdentityLinkRepo`
    - Implement: call `slackIdentityLinkRepo.upsertByMemberId` after marking code used
    - _Requirements: 7.1, 7.2_

  - [x] 6.4 Write property test for pairing code SlackIdentityLink persistence (Property 8)
    - **Property 8: Pairing code verification persists SlackIdentityLink**
    - Generate valid pairing codes and memberIds; verify SlackIdentityLink record exists with correct slackUserId after verification
    - **Validates: Requirements 7.1**

- [x] 7. Magic link verification route — set session cookie
  - [x] 7.1 Update `/api/auth/magic-link/verify/[token]/route.ts` to set session cookie
    - Write failing test: successful verification response includes `Set-Cookie` header with session token
    - Write failing test: cookie attributes match environment (HttpOnly, SameSite, Secure logic)
    - Implement: use `buildSetCookieHeader` to attach cookie on 200 response
    - _Requirements: 1.1, 1.5_

- [x] 8. Session-link route — enriched response + cookie
  - [x] 8.1 Update `/api/auth/session-link/[token]/route.ts` to return enriched response and set cookie
    - Write failing test: valid token returns memberId, sessionId, memberName, cadencePreference, sessionStatus, questions[], responses[]
    - Write failing test: response includes `Set-Cookie` header with session-scoped max-age
    - Write failing test: closed session returns sessionStatus "closed"
    - Implement: create/reuse UserSession, build enriched response, set cookie
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 8.2 Write property test for session-link response fields (Property 4)
    - **Property 4: Session-link response contains all required fields**
    - Generate valid session-link scenarios (member, session, questions); verify all required fields present and cookie header set
    - **Validates: Requirements 3.1, 3.4**

  - [x] 8.3 Write property test for session-link cookie scoping (Property 12)
    - **Property 12: Session-link cookie is scoped**
    - Generate sessions with various close times; verify Max-Age ≤ time-to-close and ≤ 7 days
    - **Validates: Requirements 3.4, 3.5**

- [x] 9. Checkpoint — Auth flows complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Protected route migration — `/api/me/*` and `/api/responses`
  - [x] 10.1 Migrate `/api/me/route.ts` to use `withAuth`
    - Write failing test: request without session cookie → 401
    - Write failing test: request with valid cookie → returns member data
    - Replace `x-member-id` header reading with Auth_Context memberId
    - _Requirements: 2.1, 2.4_

  - [x] 10.2 Migrate `/api/me/preferences`, `/api/me/availability`, `/api/me/streak`, `/api/me/slack-link`, `/api/me/delete-data` to use `withAuth`
    - Write failing tests for each: no cookie → 401, valid cookie → correct operation
    - Replace `x-member-id` header reading with Auth_Context memberId
    - _Requirements: 2.1, 2.4_

  - [x] 10.3 Migrate `/api/responses/route.ts` to use `withAuth` and body-based sessionId
    - Write failing test: no cookie → 401
    - Write failing test: valid cookie + body `{ sessionId, responses }` → saves and returns correct shape
    - Replace `x-member-id` header with Auth_Context, `x-session-id` header with body field
    - Return `{ responses: [{ questionId, score, trendIndicator, rollingAverage }] }`
    - _Requirements: 2.5, 5.1, 5.2, 5.3, 5.4_

  - [x] 10.4 Write property test for response submission round-trip (Property 6)
    - **Property 6: Response submission round-trip**
    - Generate valid submissions (authenticated, open session, scores 1-5); verify response shape includes questionId, score, trendIndicator, rollingAverage
    - **Validates: Requirements 5.1, 5.4**

- [x] 11. Protected route migration — `/api/teams/*`
  - [x] 11.1 Migrate `/api/teams/[teamId]/route.ts` to use `withAuth` + `authorizeTeamMember`
    - Write failing test: no cookie → 401; wrong team → 403; correct team → 200
    - Replace `x-user-id` reading with Auth_Context memberId
    - Add `authorizeTeamMember(auth.memberId, teamId)` call
    - _Requirements: 2.1, 2.3, 9.1, 9.2_

  - [x] 11.2 Migrate `/api/teams/[teamId]/trends/route.ts` — auth + response reshaping
    - Write failing test: no cookie → 401; wrong team → 403
    - Write failing test: response matches frontend contract (`closedAt`, `averages[]`, `trendDistribution` as array)
    - Write failing test: fewer than 2 sessions → `requiresMoreData: true`, empty arrays
    - Implement auth + authorization + reshaping at route level
    - _Requirements: 4.1, 4.2, 4.3, 9.1_

  - [x] 11.3 Write property test for trends chronological ordering (Property 5)
    - **Property 5: Trends sessions are chronologically ordered**
    - Generate teams with multiple closed sessions at different times; verify sessions array ordered oldest-first
    - **Validates: Requirements 4.3**

  - [x] 11.4 Migrate remaining team routes (`/members`, `/sessions`, `/audit-log`) to use `withAuth` + authorization
    - Write failing tests for each: no cookie → 401; wrong team → 403; audit-log requires delivery_manager role
    - Apply `authorizeTeamMember` for members/sessions; `authorizeDeliveryManager` for audit-log
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 12. Checkpoint — All protected routes migrated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Notification service wiring
  - [x] 13.1 Implement production notification sink (`src/lib/slack/production-notification-sink.ts`)
    - Write failing test: send() with linked member → calls Slack API with correct blocks
    - Write failing test: send() with unlinked member → no Slack call (silent skip)
    - Write failing test: Slack API failure → queues to SlackInteractionQueue
    - Implement `createProductionNotificationSink` factory
    - _Requirements: 8.1, 8.3, 8.5_

  - [x] 13.2 Implement production Slack link checker (`src/lib/slack/production-slack-link-checker.ts`)
    - Write failing test: member with SlackIdentityLink → returns slackUserId
    - Write failing test: member without link → returns null
    - Implement using SlackIdentityLinkRepository
    - _Requirements: 8.4_

  - [x] 13.3 Wire NotificationService in scheduler tick route (`src/app/api/scheduler/tick/route.ts`)
    - Write failing test: session open event → NotificationService.send called for eligible members
    - Wire production sink + link checker in route-level composition
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 14. Slack routes — database-backed identity resolution
  - [x] 14.1 Update `/api/slack/interactions/route.ts` to use SlackIdentityLinkRepository
    - Write failing test: Slack userId in DB → resolves to memberId
    - Write failing test: unknown Slack userId → appropriate error response
    - Replace in-memory Map with repository query
    - _Requirements: 7.3_

  - [x] 14.2 Implement `/api/slack/commands/route.ts` `/healthcheck` command
    - Write failing test: linked member with open session → returns health check prompt blocks
    - Write failing test: linked member with no open session → returns "no active session" message
    - Write failing test: unlinked Slack user → returns pairing instructions
    - Implement using SlackIdentityLinkRepository + session lookup
    - _Requirements: 7.4_

- [x] 15. Checkpoint — Notification and Slack wiring complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Environment-aware Prisma client (Turso production support)
  - [x] 16.1 Update `src/lib/prisma.ts` for environment-aware initialization
    - Write failing test: when TURSO_DATABASE_URL is not set → uses default PrismaClient (better-sqlite3)
    - Write failing test: when TURSO_DATABASE_URL is set → creates libSQL adapter client
    - Implement conditional client creation with `@libsql/client` + `@prisma/adapter-libsql`
    - Add `@libsql/client` and `@prisma/adapter-libsql` to package.json dependencies
    - _Requirements: 13.1, 13.2, 13.5_

  - [x] 16.2 Add Turso setup documentation to README.md
    - Document environment variables (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
    - Document Vercel deployment configuration
    - _Requirements: 13.4_

- [x] 17. Repository hygiene and cleanup
  - [x] 17.1 Rename package and remove scaffolding
    - Update package.json `name` from "nextjs-fullstack-starter" to "team-health-check"
    - Remove `/api/items` route and `[id]` sub-route (leftover scaffolding)
    - _Requirements: 11.1, 11.2_

  - [x] 17.2 Update AI_CONTEXT.md and README.md
    - Remove "Outstanding Work" items that are complete
    - Add integration-hardening spec reference
    - Update Next.js version reference to 16.x
    - _Requirements: 11.3, 11.4_

- [x] 18. MSW mock alignment
  - [x] 18.1 Update MSW handlers to match new API contracts
    - Update `/api/auth/session-link/[token]` mock: field `responses` (not `existingResponses`)
    - Update `/api/teams/[teamId]/trends` mock: `closedAt`, `averages[]`, `trendDistribution` as array
    - Update `/api/responses` mock: body-based auth, no header requirements
    - _Requirements: 12.1, 12.4_

  - [x] 18.2 Fix UI component tests after MSW changes
    - Run UI tests, identify failures from contract changes
    - Update UI components to match new contracts where needed
    - _Requirements: 12.2, 12.3_

- [x] 19. Checkpoint — All unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. End-to-end acceptance test
  - [x] 20.1 Create Playwright happy-path test (`e2e/happy-path.spec.ts`)
    - Implement test: request magic link → capture token via interceptor → verify → genesis → create team → add member → open session → submit responses → view dashboard
    - Use test email interceptor (InMemoryEmailService in TEST_MODE)
    - Verify session cookie is set after magic-link verification
    - Verify response submission results visible on dashboard (or "needs more data" state)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 20.2 Update CI workflow (`.github/workflows/ci.yml`)
    - Add Playwright job after build step
    - Configure TEST_MODE=true environment
    - Ensure no external service dependencies in CI
    - _Requirements: 10.5, 10.6_

- [x] 21. Final checkpoint — Full integration verification
  - Ensure all tests pass (unit, property, integration, E2E), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based test sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after logical groups complete
- Property tests validate universal correctness properties from the design document (12 properties)
- Unit tests validate specific examples and edge cases following TDD (Red → Green → Refactor)
- All services use factory injection with repository interfaces — never import Prisma directly
- All errors extend AppError with typed codes — no raw string throws
- Route handlers remain thin: validate (Zod), call service, format response

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.2"] },
    { "id": 2, "tasks": ["1.4", "1.5", "3.1", "4.3", "4.4"] },
    { "id": 3, "tasks": ["3.2", "4.5", "4.6", "6.1", "6.3"] },
    { "id": 4, "tasks": ["6.2", "6.4", "7.1", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "10.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["10.4", "11.1", "11.2", "11.4"] },
    { "id": 7, "tasks": ["11.3", "13.1", "13.2"] },
    { "id": 8, "tasks": ["13.3", "14.1", "14.2"] },
    { "id": 9, "tasks": ["16.1", "16.2", "17.1", "17.2"] },
    { "id": 10, "tasks": ["18.1"] },
    { "id": 11, "tasks": ["18.2"] },
    { "id": 12, "tasks": ["20.1", "20.2"] }
  ]
}
```
