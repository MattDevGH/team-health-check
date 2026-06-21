# Implementation Plan: Team Health Check

## Overview

This plan implements the Team Health Check feature as a Next.js 15 App Router application with SQLite (Prisma 7), following TDD (red-green-refactor), repository pattern with factory injection, and vertical slices. Each task implements one testable behaviour. Services depend on repository interfaces with in-memory fakes for unit tests.

## Tasks

- [x] 1. Foundation: Error handling, validation, and shared infrastructure
  - [x] 1.1 Create AppError base class and typed error subclasses
    - Create `src/lib/errors.ts` with `AppError` base class containing `code` and `statusCode`
    - Implement subclasses: `ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `RateLimitError`
    - `ValidationError` accepts a `fields` array of `{ field?: string; message: string; code: string }`
    - Write unit test verifying each error has correct statusCode and code
    - _Requirements: 20.2, 20.3, 20.5_

  - [x] 1.2 Create Zod validation schemas
    - Create `src/lib/validation/schemas.ts` with schemas: `createTeamSchema`, `addMemberSchema`, `submitResponseSchema`, `scheduleSchema`
    - Each schema must trim strings and enforce min/max lengths per requirements
    - Write unit tests for each schema covering valid and invalid inputs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.4, 4.5, 3.1_

  - [x] 1.3 Write property tests for validation schemas
    - **Property 2: Whitespace-only team names are rejected**
    - **Property 3: Invalid emails are rejected, valid emails are accepted**
    - **Property 11: Score validation — accept [1,5], reject outside**
    - Use fast-check to generate arbitrary whitespace strings, invalid emails, and out-of-range scores
    - _Validates: Requirements 1.2, 1.4, 4.4, 4.5, 5.6, 5.7_

  - [x] 1.4 Create `withErrorHandling` route handler wrapper
    - Create `src/lib/api-utils.ts` with wrapper that catches typed errors and maps to HTTP responses
    - Map `ValidationError` → 400, `NotFoundError` → 404, `ForbiddenError` → 403, `ConflictError` → 409, `RateLimitError` → 429
    - Unexpected errors return generic 500 with no internal details
    - All responses have `Content-Type: application/json`
    - Write unit tests for each error type mapping
    - _Requirements: 20.2, 20.3, 20.4, 20.5_

  - [x] 1.5 Write property test for API error response format consistency
    - **Property 27: API error response format consistency**
    - Verify all validation failures produce `{ errors: [...] }` with HTTP 400
    - Verify non-existent resource references produce HTTP 404 with JSON error
    - _Validates: Requirements 20.2, 20.3, 20.4_

  - [x] 1.6 Create rate limiter utility
    - Create `src/lib/rate-limit.ts` with in-memory sliding window counter
    - Implement `checkRateLimit(key, limit, windowMs)` returning boolean
    - Include periodic cleanup to prevent unbounded memory growth
    - Write unit tests for limit enforcement and window expiry
    - _Requirements: 6.7, 7.5_

  - [x] 1.7 Install dependencies and update Prisma schema
    - Add `zod`, `date-fns-tz` to dependencies; `fast-check` to devDependencies
    - Replace placeholder Prisma schema with full data model from design
    - Run `npx prisma migrate dev --name init` to create migration
    - Create seed script with the 5 fixed questions
    - _Requirements: 9.1, 9.2_

- [x] 2. Repository layer: interfaces and in-memory fakes

  - [x] 2.1 Define repository interfaces
    - Create `src/lib/repositories/types.ts` with all repository interfaces: `TeamRepository`, `TeamMemberRepository`, `SessionRepository`, `ResponseRepository`, `SessionLinkRepository`, `MagicLinkRepository`, `AuditLogRepository`, `SessionAggregateRepository`, `QuestionRepository`, `AvailabilityRepository`, `TeamMemberRoleRepository`, `PairingCodeRepository`, `UserSessionRepository`, `PendingGenesisRepository`
    - Define all method signatures with typed inputs/outputs
    - _Requirements: 1.1, 1.3, 3.2, 10.1_

  - [x] 2.2 Implement in-memory TeamRepository and TeamMemberRepository fakes
    - Create `src/lib/repositories/in-memory/team.repository.ts`
    - Create `src/lib/repositories/in-memory/team-member.repository.ts`
    - Implement all interface methods using Map/Array storage
    - Enforce uniqueness constraint on (teamId, name, email) for members
    - Write unit tests verifying CRUD operations and uniqueness
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 2.3 Implement in-memory SessionRepository and ResponseRepository fakes
    - Create `src/lib/repositories/in-memory/session.repository.ts`
    - Create `src/lib/repositories/in-memory/response.repository.ts`
    - Implement upsert with uniqueness on (memberId, sessionId, questionId)
    - Implement `findRecentByTeamAndQuestion` for rolling average support
    - Write unit tests for upsert idempotency and query methods
    - _Requirements: 3.2, 10.2, 10.3_

  - [x] 2.4 Implement remaining in-memory repository fakes
    - Create fakes for: `SessionLinkRepository`, `MagicLinkRepository`, `AuditLogRepository`, `SessionAggregateRepository`, `QuestionRepository`, `AvailabilityRepository`, `TeamMemberRoleRepository`, `PairingCodeRepository`, `UserSessionRepository`, `PendingGenesisRepository`
    - Implement atomic `claimToken` for MagicLink (CAS pattern simulated in-memory)
    - Write unit tests for token claim atomicity and expiry checks
    - _Requirements: 6.1, 7.2, 18.1_

  - [x] 2.5 Create repository factory and index
    - Create `src/lib/repositories/index.ts` exporting `createInMemoryRepositories()` factory
    - Factory returns all in-memory repositories pre-wired for test use
    - _Requirements: (infrastructure)_

- [x] 3. Checkpoint - Ensure foundation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Team management service

  - [x] 4.1 Implement team creation (TeamService.create)
    - Create `src/lib/services/team.service.ts` with `createTeamService` factory
    - Implement `create(name, description, creatorId)` — trims name, validates non-empty, creates team, assigns delivery_manager role, logs audit entry
    - Write failing test first: valid name creates team; whitespace-only name rejects
    - _Requirements: 1.1, 1.2, 19.4_

  - [x] 4.2 Write property test for team creation data preservation
    - **Property 1: Valid entity creation preserves data**
    - Generate arbitrary valid names (1-100 chars, non-whitespace-only) and verify round-trip
    - _Validates: Requirements 1.1, 1.3_

  - [x] 4.3 Implement add team member (TeamService.addMember)
    - Implement `addMember(teamId, name, email)` — validates name, validates email format if provided, checks uniqueness, creates member
    - Write failing test: valid member added; duplicate (name+email) rejected with ConflictError; invalid email rejected
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 4.4 Write property test for team member uniqueness
    - **Property 4: Team member uniqueness invariant**
    - Generate arbitrary (name, email) combos; add twice; verify second fails; verify exactly one record
    - _Validates: Requirements 1.5_

  - [x] 4.5 Implement remove team member (TeamService.removeMember)
    - Implement `removeMember(teamId, memberId, userId)` — disassociates member without deleting response history, logs audit
    - Write failing test: removed member's responses still exist; member no longer in team roster
    - _Requirements: 1.6_

  - [x] 4.6 Write property test for member removal preserving responses
    - **Property 5: Member removal preserves historical responses**
    - Generate member with N responses across M sessions; remove; verify all responses intact
    - _Validates: Requirements 1.6_

  - [x] 4.7 Implement team archive and unarchive
    - Implement `archive(teamId, userId)` — sets archived flag, force-closes open session, stops schedule, logs audit
    - Implement `unarchive(teamId, userId)` — clears archived flag, restores functionality, logs audit
    - Write failing tests: archive closes open session; unarchive allows new sessions; historical data preserved
    - _Requirements: 1.8, 1.9, 1.10_

  - [x] 4.8 Write property test for archive/unarchive round-trip
    - **Property 6: Archive/unarchive round-trip restores functionality**
    - Generate teams with varied configurations; archive then unarchive; verify full functionality restored
    - _Validates: Requirements 1.9, 1.10_

  - [x] 4.9 Implement getMembers and list teams
    - Implement `getMembers(teamId)` — returns current members or empty list message
    - Write failing test: team with members returns list; team with no members returns empty array
    - _Requirements: 1.7_

- [x] 5. Roles and permissions service

  - [x] 5.1 Implement role assignment and removal
    - Create `src/lib/services/role.service.ts` with `createRoleService` factory
    - Implement `assignRole(teamId, memberId, role, actorId)` and `removeRole(teamId, memberId, role, actorId)`
    - Enforce minimum one delivery_manager constraint on removal
    - Write failing tests: assign works; remove last DM fails; remove non-last DM succeeds
    - _Requirements: 19.1, 19.5, 19.6, 19.7_

  - [x] 5.2 Write property tests for role-based access control
    - **Property 25: Role-based access control enforcement**
    - **Property 26: Minimum one delivery manager constraint**
    - Generate teams with N delivery managers; attempt to remove all; verify last removal fails
    - Generate team_member-only users; verify DM-only actions rejected
    - _Validates: Requirements 19.2, 19.3, 19.6, 19.7, 19.8, 19.9_

  - [x] 5.3 Implement permission check middleware
    - Create `src/lib/services/permission.service.ts` with `requireRole(teamId, userId, role)` helper
    - Throws `ForbiddenError` if user lacks required role
    - Write failing test: team_member calling DM action gets ForbiddenError
    - _Requirements: 19.8, 19.9_

  - [x] 5.4 Implement genesis creation flow with atomic CAS verification
    - Create `src/lib/services/genesis.service.ts` with `createGenesisService` factory
    - Implement `executeGenesis(token)` — atomically claims PendingGenesis token (CAS), creates Team, creates TeamMember with provided email, assigns delivery_manager role, creates UserSession, all within a single transaction
    - If token already used or expired, reject with appropriate error (no partial state left behind)
    - Write failing tests: valid token creates team+member+role atomically; used token rejected; expired token rejected; concurrent calls to same token result in exactly one successful creation
    - _Requirements: 7.9, 19.4_

- [x] 6. Checkpoint - Ensure team management and roles tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Session lifecycle service

  - [x] 7.1 Implement session open (SessionService.open)
    - Create `src/lib/services/session.service.ts` with `createSessionService` factory
    - Implement `open(teamId, userId)` — creates session with status "open", generates session links for all members
    - Enforce at-most-one open session: close existing open session before opening new one
    - Write failing tests: open creates session; open with existing open session closes it first
    - _Requirements: 3.2, 3.9, 6.1_

  - [x] 7.2 Write property tests for session invariants
    - **Property 31: At-most-one open session per team (Highlander invariant)**
    - Generate arbitrary sequences of open/close operations; verify never more than 1 open session per team
    - _Validates: Requirements 3.8, 3.9_

  - [x] 7.3 Implement session close (SessionService.close)
    - Implement `close(sessionId, userId)` — sets status "closed", records actualCloseAt
    - Reject close on already-closed session with ConflictError
    - Write failing tests: close succeeds; double-close rejected
    - _Requirements: 3.4, 3.10_

  - [x] 7.4 Implement session link generation
    - Implement `generateSessionLinks(sessionId)` — creates one token per member with ≥32 char cryptographic random token
    - Set expiry to 7 days after session close (configurable)
    - Write failing test: N members → N links; tokens are ≥32 chars and unique
    - _Requirements: 6.1, 6.2_

  - [x] 7.5 Write property test for session link generation
    - **Property 13: Session link generation and round-trip validation**
    - Generate teams with N members; open session; verify exactly N links with ≥32 char tokens; validate round-trip
    - _Validates: Requirements 6.1, 6.2, 6.3_

  - [x] 7.5 Implement aggregate materialisation
    - Implement `materializeAggregates(sessionId)` — computes average score (1 decimal), response count, trend indicator distribution per question
    - Store as `SessionAggregate` records
    - Write failing test: session with known responses produces correct averages and counts
    - _Requirements: 8.1, NFR 4.2_

  - [x] 7.6 Write property test for session average computation
    - **Property 16: Session average computation correctness**
    - Generate arbitrary sets of scores (1-5); verify materialised average equals arithmetic mean rounded to 1 decimal place
    - _Validates: Requirements 8.1_

  - [x] 7.7 Implement schedule configuration
    - Create `src/lib/services/schedule.service.ts` with `createScheduleService` factory
    - Implement `configure(teamId, schedule)` — stores schedule, calculates next session window using timezone-aware logic
    - Validate that schedule includes timezone (default Europe/London)
    - Warn if session duration < 24 hours (closing reminder suppressed)
    - Write failing tests: schedule saved; next window calculated correctly for timezone; DST transition handled
    - _Requirements: 3.1, 3.2, 3.11_

- [x] 8. Response submission service

  - [x] 8.1 Implement response upsert (ResponseService.upsert)
    - Create `src/lib/services/response.service.ts` with `createResponseService` factory
    - Implement `upsert(params)` — validates session is open, member belongs to team, score 1-5, upserts response
    - Write failing tests: valid submission succeeds; closed session rejects; non-member rejects; score out of range rejects; duplicate updates existing
    - _Requirements: 3.6, 3.7, 3.8, 4.4, 4.5, 10.1, 10.2, 10.3_

  - [x] 8.2 Write property test for response upsert idempotency
    - **Property 12: Response upsert — exactly one record per (member, question, session)**
    - Generate N submissions for same (member, question, session) with varying scores; verify exactly one record with latest score
    - _Validates: Requirements 10.2, 10.3, 4.8_

  - [x] 8.3 Write property tests for submission access control
    - **Property 9: Submissions succeed if and only if the member belongs to the team**
    - **Property 10: Closed sessions reject all submissions**
    - Generate members and non-members; verify only members succeed on open session; all fail on closed
    - _Validates: Requirements 3.6, 3.7, 3.8, 4.9, 6.5_

  - [x] 8.4 Implement rolling average calculation
    - Implement `getRollingAverage(teamId, questionId, count)` — calculates mean of most recent N responses (default 20)
    - Return null if fewer than 5 responses exist
    - Write failing tests: exact average calculation; null when < 5 responses; spans previous sessions
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 8.5 Write property test for rolling average correctness
    - **Property 21: Rolling average computation correctness**
    - Generate sequences of scores; verify rolling average matches arithmetic mean of most recent N
    - _Validates: Requirements 16.1, 16.2, 16.3_

- [x] 9. Checkpoint - Ensure session and response service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Authentication service

  - [x] 10.1 Implement session link validation (AuthService.validateSessionLink)
    - Create `src/lib/services/auth.service.ts` with `createAuthService` factory
    - Implement `validateSessionLink(token)` — validates token exists, not expired, session not closed >7 days ago
    - Return member and session IDs on success; null on invalid/expired token
    - Write failing tests: valid token returns IDs; invalid token returns null; expired link returns null
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

  - [x] 10.2 Write property test for session link tokens
    - **Property 14: Invalid session link tokens return 404**
    - Generate random strings that were never issued as tokens; verify all return null
    - _Validates: Requirements 6.4_

  - [x] 10.3 Implement magic link request and verification
    - Implement `requestMagicLink(email)` — rate-limit (5/hour), generate token, store with 1-hour expiry
    - Always return success regardless of email existence (anti-enumeration)
    - Implement `verifyMagicLink(token)` — atomic CAS claim (single-use), return discriminated union (authenticated vs requires_team_creation)
    - Write failing tests: valid token claimed once; second claim fails; expired token fails; unknown email returns genesis state
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.8, 7.9_

  - [x] 10.4 Write property tests for magic link lifecycle
    - **Property 15: Magic link single-use and time-bounded**
    - **Property 34: Magic link response indistinguishability (anti-enumeration)**
    - Generate tokens; verify single-use; verify expiry after 1 hour; verify response shape identical for known/unknown emails
    - _Validates: Requirements 7.2, 7.4, 7.5, 7.8, 7.9_

  - [x] 10.5 Implement Slack pairing code generation and verification
    - Implement `generatePairingCode(slackUserId)` — creates 6-char code with 10-minute expiry
    - Implement `verifyPairingCode(memberId, code)` — verifies code, creates SlackIdentityLink
    - Write failing tests: valid code within 10 min succeeds; expired code fails; used code fails
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x] 10.6 Write property test for pairing code expiry
    - **Property 7: Pairing codes expire within 10 minutes**
    - Generate codes; verify access after 10 min fails; verify within 10 min succeeds
    - _Validates: Requirements 2.3, 2.5_

  - [x] 10.7 Implement session link rate limiting
    - Apply rate limiter to session link validation: 10 failures per IP in 5 minutes → 15 min lockout
    - Write failing test: 11th failed attempt within 5 min returns 429
    - _Requirements: 6.7_

  - [x] 10.8 Write concurrency integration tests for atomic token claims
    - Test `AuthService.verifyMagicLink`: fire N concurrent calls with the same token; verify exactly 1 succeeds and N-1 fail; verify exactly 1 UserSession created
    - Test `GenesisService.executeGenesis`: fire N concurrent calls with the same pending token; verify exactly 1 team+member+role created; verify N-1 receive conflict/used-token error
    - Use real SQLite with Prisma to exercise actual row-level locking / CAS behaviour
    - _Validates: Property 15 (magic link single-use), Requirements 7.2, 7.9_

- [x] 11. Trend and aggregation service

  - [x] 11.1 Implement trend data retrieval (TrendService.getSessionAverages)
    - Create `src/lib/services/trend.service.ts` with `createTrendService` factory
    - Implement `getSessionAverages(teamId, questionId)` — returns averages from materialised aggregates, ordered chronologically
    - Suppress data if fewer than 3 responses in anonymous mode (configurable threshold)
    - Omit sessions with zero responses for a question
    - Write failing tests: correct averages returned; insufficient data suppressed; zero-response session omitted
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

  - [x] 11.2 Write property test for data suppression in anonymous mode
    - **Property 17: Data suppression for insufficient responses in anonymous mode**
    - Generate sessions with 0, 1, 2 responses in anonymous mode; verify suppression/omission
    - _Validates: Requirements 8.6, 8.7_

  - [x] 11.3 Implement trend indicator distribution
    - Implement `getTrendIndicatorDistribution(sessionId)` — returns counts of improving/stable/declining per question
    - Write failing test: known responses produce correct distribution counts
    - _Requirements: 8.4_

  - [x] 11.4 Implement CSV export (TrendService.exportCSV)
    - Implement `exportCSV(teamId, dateRange?)` — generates CSV with columns: session date, question, average score, response count, trend indicator distribution
    - Respect privacy mode: anonymous mode exports only aggregated data
    - Write failing tests: CSV columns correct; anonymous mode excludes individual data; date range filter works
    - _Requirements: 8.9, 8.10, 8.11_

  - [x] 11.5 Write property tests for CSV export
    - **Property 18: CSV export serialization round-trip**
    - **Property 19: Anonymous mode CSV contains no individual data**
    - Generate trend data; export CSV; parse and verify values match; verify no individual identifiers in anonymous mode
    - _Validates: Requirements 8.9, 8.10_

- [x] 12. Privacy, availability, and streak services

  - [x] 12.1 Implement privacy mode enforcement
    - Add privacy mode checks to TrendService and ResponseService
    - Anonymous mode: suppress individual data in all API responses, dashboards, exports
    - Attributed mode: allow individual-level data for authorised roles
    - Require confirmation when switching to attributed mode; log audit entry
    - Write failing tests: anonymous mode hides individual data; mode switch logged
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.8_

  - [x] 12.2 Write property test for privacy mode enforcement
    - **Property 29: Privacy mode prevents individual data exposure**
    - Generate teams in anonymous mode; verify no API response exposes individual scores/identifiers
    - _Validates: Requirements 14.2, 14.3, 20.6_

  - [x] 12.3 Implement availability (away) marking
    - Create `src/lib/services/availability.service.ts` with `createAvailabilityService` factory
    - Implement mark away, remove away, check if member is away during a session
    - Away members excluded from participation counts and prompts
    - Write failing tests: away member excluded from participation; removed away re-includes
    - _Requirements: 12.1, 12.2, 12.7_

  - [x] 12.4 Write property test for availability exclusion
    - **Property 30: Availability exclusion from participation**
    - Generate away members; verify excluded from counts, prompts, and reminders
    - _Validates: Requirements 12.1, 12.2_

  - [x] 12.5 Implement streak calculation (StreakService.calculate)
    - Create `src/lib/services/streak.service.ts` with `createStreakService` factory
    - Implement streak logic: consecutive sessions with ≥1 response, away sessions excluded, one missed session grace within 14 days
    - Track current and best streak
    - Write failing tests: streak counts correctly; away excluded; grace period works; streak resets after 2 misses
    - _Requirements: 17.1, 17.3, 17.4, 17.7_

  - [x] 12.6 Write property tests for streak calculation
    - **Property 22: Streak calculation correctness**
    - **Property 23: Cadence change preserves streak**
    - Generate participation sequences; verify streak matches expected; verify cadence change doesn't reset streak
    - _Validates: Requirements 17.1, 17.3, 17.6, 17.7_

- [~] 13. Checkpoint - Ensure all service layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Audit log and data deletion services

  - [x] 14.1 Implement audit log service (AuditService.log)
    - Create `src/lib/services/audit.service.ts` with `createAuditService` factory
    - Implement `log(entry)` — append-only, stores changeType, previous/new values, userId, UTC timestamp
    - Implement `getLog(teamId, pagination)` — read-only retrieval, most recent first
    - No modify or delete operations exposed
    - Write failing tests: entry created with correct fields; entries retrieved in reverse chronological order; no individual scores in audit
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [~] 14.2 Write property test for audit log immutability
    - **Property 24: Audit log completeness and immutability**
    - Generate config changes; verify audit entry for each; verify no entry modifiable or deletable; verify no scores in entries
    - _Validates: Requirements 18.1, 18.2, 18.3, 18.6_

  - [~] 14.3 Implement data deletion (GDPR self-service)
    - Add `deleteMyData(memberId)` to ResponseService
    - Removes all individual response records; preserves materialised aggregates
    - Decrements live participation count if session is active
    - Logs deletion event in audit (without recording deleted data). The audit log entry must capture: TeamMemberId (hashed/masked for privacy), Timestamp (UTC), ActionType ("data_deletion"), and TeamId. It must NOT log what data was deleted — only that a deletion occurred
    - Write failing tests: responses deleted; aggregates unchanged; active session participation decremented; audit entry contains hashed memberId, timestamp, actionType "data_deletion", and teamId; audit entry does NOT contain any deleted response data
    - _Requirements: NFR 4.3, NFR 4.5, NFR 4.6, NFR 4.7_

  - [~] 14.4 Write property tests for data deletion
    - **Property 28: Data deletion preserves materialised aggregates**
    - **Property 33: Live participation decrement on mid-session data deletion**
    - Generate members with responses and materialised aggregates; delete; verify aggregates unchanged; verify live count decremented
    - _Validates: Requirements NFR 4.5, NFR 4.6_

- [ ] 15. Notification service

  - [~] 15.1 Implement notification service core
    - Create `src/lib/services/notification.service.ts` with `createNotificationService` factory
    - Implement `sendSlackPrompt(memberId, session)` — only sends to Slack-linked members
    - Implement `sendClosingReminder(memberId, session)` — only sends if member hasn't completed all questions, not away, reminders enabled
    - Implement `sendMidSessionNudge(memberId, session)` — only sends if member missed previous session, max once per session
    - Write failing tests: linked member gets prompt; unlinked member skipped; completed member skipped for reminder
    - _Requirements: 2.8, 5.2, 5.13, 13.1, 13.2, 13.3, 13.6, 13.8_

  - [~] 15.2 Write property test for Slack prompt targeting
    - **Property 8: Only linked members receive Slack prompts**
    - Generate teams with mix of linked/unlinked members; verify prompt recipients exactly match linked set
    - _Validates: Requirements 2.8, 5.13_

  - [~] 15.3 Implement pre-session notification
    - Implement `sendPreSessionNotification(teamId, session)` — lists expected participants and away members; sends to configurable recipient (DM or channel)
    - Write failing test: notification includes correct expected/away lists; respects configured recipient
    - _Requirements: 12.3, 12.4, 12.5, 12.6_

  - [~] 15.4 Implement micro-pulse question selection
    - Create `src/lib/services/question-selection.service.ts`
    - Implement weighted random selection: prefer unanswered questions, weight by gap since last response
    - When remaining days < unanswered questions, bundle multiple questions
    - Write failing tests: unanswered questions preferred; all 5 questions covered within session; bundling when days insufficient
    - _Requirements: 15.3, 15.4, 15.5_

  - [~] 15.5 Write property test for micro-pulse question exhaustion
    - **Property 32: Micro-pulse question exhaustion guarantee**
    - Generate active micro-pulse members over full session; verify all 5 questions delivered exactly once
    - _Validates: Requirements 15.5, 15.6_

  - [~] 15.6 Write property test for question order invariant
    - **Property 20: Question order invariant**
    - Generate various sessions and members; verify questions always returned in fixed order
    - _Validates: Requirements 9.1, 9.3_

- [ ] 16. Scheduler service

  - [~] 16.1 Implement scheduler tick handler
    - Create `src/lib/services/scheduler.service.ts` with `createSchedulerService` factory
    - Implement `tick(now)` — desired state reconciliation: open due sessions, close due sessions, materialise pending aggregates, trigger prompts/reminders
    - Idempotent: safe to call multiple times
    - Write failing tests: due session opens; due session closes; pending aggregates materialised; prompts triggered for linked members
    - _Requirements: 3.2, 3.3, 3.4, 3.9, NFR 4.4_

  - [~] 16.2 Implement lazy aggregate materialisation in scheduler
    - Detect closed sessions where `materialisedAt` is null and quiet period (30s) has elapsed
    - Trigger materialisation for each pending session
    - Write failing test: session closed >30s ago gets materialised; session closed <30s ago skipped
    - _Requirements: NFR 4.4_

- [~] 17. Checkpoint - Ensure notification and scheduler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Prisma repository implementations

  - [~] 18.1 Implement Prisma TeamRepository and TeamMemberRepository
    - Create `src/lib/repositories/prisma/team.repository.ts`
    - Create `src/lib/repositories/prisma/team-member.repository.ts`
    - Implement all interface methods using Prisma client
    - Write integration tests against real SQLite
    - _Requirements: 1.1, 1.3, 1.5_

  - [~] 18.2 Implement Prisma SessionRepository and ResponseRepository
    - Create `src/lib/repositories/prisma/session.repository.ts`
    - Create `src/lib/repositories/prisma/response.repository.ts`
    - Implement upsert with unique constraint on (memberId, sessionId, questionId)
    - Write integration tests against real SQLite
    - _Requirements: 3.2, 10.2_

  - [~] 18.3 Implement Prisma auth-related repositories
    - Create Prisma implementations for: `SessionLinkRepository`, `MagicLinkRepository`, `PairingCodeRepository`, `UserSessionRepository`, `PendingGenesisRepository`
    - Implement atomic `claimToken` using raw SQL UPDATE with WHERE conditions
    - Write integration tests for atomic claim behaviour
    - _Requirements: 6.1, 7.2, 2.4_

  - [~] 18.4 Implement Prisma AuditLogRepository and SessionAggregateRepository
    - Create `src/lib/repositories/prisma/audit-log.repository.ts`
    - Create `src/lib/repositories/prisma/session-aggregate.repository.ts`
    - Write integration tests
    - _Requirements: 18.1, 8.1_

  - [~] 18.5 Create production repository factory and container
    - Create `src/lib/repositories/prisma/index.ts` exporting `createPrismaRepositories(prisma)` factory
    - Create `src/lib/container.ts` wiring production repositories to services
    - Export configured service instances for use by route handlers
    - _Requirements: (infrastructure)_

- [ ] 19. API route handlers: Team management

  - [~] 19.1 Implement POST /api/teams (create team)
    - Create `src/app/api/teams/route.ts`
    - Validate input with `createTeamSchema`, call TeamService.create, return team JSON
    - Require authenticated session (magic link session)
    - _Requirements: 1.1, 1.2, 20.1_

  - [~] 19.2 Implement GET/PATCH/DELETE /api/teams/[teamId]
    - Create `src/app/api/teams/[teamId]/route.ts`
    - GET: return team details; PATCH: update name/description; DELETE: archive team
    - Enforce delivery_manager role for PATCH and DELETE
    - _Requirements: 1.8, 19.2_

  - [~] 19.3 Implement POST /api/teams/genesis (create team from magic link)
    - Create `src/app/api/teams/genesis/route.ts`
    - Validate pending genesis token (CAS claim), create team + member + role in transaction
    - Return teamId, memberId, sessionToken
    - _Requirements: 7.9_

  - [~] 19.4 Implement team member routes
    - Create `src/app/api/teams/[teamId]/members/route.ts` (GET list, POST add)
    - Create `src/app/api/teams/[teamId]/members/[memberId]/route.ts` (PATCH, DELETE remove)
    - Validate with `addMemberSchema`, enforce delivery_manager role for mutations
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 19.2_

- [ ] 20. API route handlers: Sessions, responses, and auth

  - [~] 20.1 Implement session routes
    - Create `src/app/api/teams/[teamId]/sessions/route.ts` (GET list, POST open manual)
    - Create `src/app/api/teams/[teamId]/sessions/[sessionId]/route.ts` (GET, PATCH close)
    - Enforce delivery_manager role for open/close
    - _Requirements: 3.5, 3.10, 19.2_

  - [~] 20.2 Implement response submission route
    - Create `src/app/api/responses/route.ts` (POST)
    - Validate with `submitResponseSchema`, call ResponseService.upsert
    - Return rolling average for each answered question
    - _Requirements: 4.4, 4.6, 16.1_

  - [~] 20.3 Implement session link auth route
    - Create `src/app/api/auth/session-link/[token]/route.ts` (GET)
    - Validate token, apply rate limiting, return member/session context or 404
    - _Requirements: 6.3, 6.4, 6.7_

  - [~] 20.4 Implement magic link routes
    - Create `src/app/api/auth/magic-link/request/route.ts` (POST) — rate-limited, always returns 200
    - Create `src/app/api/auth/magic-link/verify/[token]/route.ts` (GET) — atomic claim, returns auth or genesis state
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.8, 7.9_

  - [~] 20.5 Implement Slack pairing route
    - Create `src/app/api/auth/slack-pairing/route.ts` (POST)
    - Accept pairing code + memberId, call AuthService.verifyPairingCode
    - _Requirements: 2.4, 2.5_

  - [~] 20.6 Implement schedule and trends routes
    - Create `src/app/api/teams/[teamId]/schedule/route.ts` (GET, PUT)
    - Create `src/app/api/teams/[teamId]/trends/route.ts` (GET)
    - Create `src/app/api/teams/[teamId]/export/route.ts` (GET — CSV download)
    - Enforce privacy mode on trends/export responses
    - _Requirements: 3.1, 8.1, 8.9, 20.6_

  - [~] 20.7 Implement participation route
    - Create `src/app/api/teams/[teamId]/sessions/[sessionId]/participation/route.ts` (GET)
    - Return responded count, total count, non-responder names (subject to privacy mode and role)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [~] 20.8 Implement user profile and preferences routes
    - Create `src/app/api/me/route.ts` (GET current user)
    - Create `src/app/api/me/preferences/route.ts` (PATCH — cadence, reminders)
    - Create `src/app/api/me/availability/route.ts` (POST mark away, DELETE remove away)
    - Create `src/app/api/me/streak/route.ts` (GET)
    - Create `src/app/api/me/slack-link/route.ts` (DELETE — unlink)
    - Create `src/app/api/me/delete-data/route.ts` (POST — GDPR deletion)
    - _Requirements: 13.1, 15.1, 15.2, 12.1, 12.7, 17.1, 2.6, NFR 4.3_

  - [~] 20.9 Implement audit log route
    - Create `src/app/api/teams/[teamId]/audit-log/route.ts` (GET)
    - Paginated, most recent first, delivery_manager only
    - _Requirements: 18.4, 18.5, 19.2_

  - [~] 20.10 Implement scheduler tick route
    - Create `src/app/api/scheduler/tick/route.ts` (POST)
    - Authenticate via CRON_SECRET in Authorization header
    - Call SchedulerService.tick()
    - _Requirements: 3.2, 3.3_

- [~] 21. Checkpoint - Ensure API route handler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Slack bot integration

  - [~] 22.1 Implement Slack signature verification middleware
    - Create `src/lib/slack/verify-signature.ts`
    - Verify HMAC-SHA256 signature using timing-safe comparison
    - Reject requests older than 5 minutes (replay protection)
    - Write unit test with known signature/body pairs
    - _Requirements: 5.6 (implicit security)_

  - [~] 22.2 Implement Slack events route
    - Create `src/app/api/slack/events/route.ts` (POST)
    - Handle URL verification challenge
    - Route relevant events (app_mention, message) to appropriate handlers
    - _Requirements: 5.14_

  - [~] 22.3 Implement Slack interactions route (response submission)
    - Create `src/app/api/slack/interactions/route.ts` (POST)
    - Use immediate ack + `after()` deferred processing pattern
    - Parse interaction payload, validate scores, upsert responses
    - Send confirmation or error follow-up on failure
    - _Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, NFR 1.2_

  - [~] 22.4 Implement Slack slash commands route
    - Create `src/app/api/slack/commands/route.ts` (POST)
    - Handle `/healthcheck` — respond with prompts for current session based on cadence and unanswered questions
    - Handle `/healthcheck connect` — generate pairing code
    - Handle no active session gracefully
    - _Requirements: 2.2, 5.14, 5.15_

  - [~] 22.5 Implement Slack prompt message formatting
    - Create `src/lib/slack/message-builder.ts`
    - Build interactive messages with Score buttons (1-5) and optional Trend_Indicator menu
    - Include Session_Link fallback in each message
    - Write unit tests for message structure
    - _Requirements: 5.4, 5.5_

  - [~] 22.6 Implement Slack prompt delivery with retry
    - Create `src/lib/slack/delivery.ts`
    - Implement delivery with up to 3 retries, 5s minimum interval between attempts
    - Log failure if all retries exhausted
    - Only deliver to members with linked Slack identity
    - Write unit tests with mocked Slack API (success, transient failure, permanent failure)
    - _Requirements: 5.12, 5.13_

  - [~] 22.7 Implement Slack bot state drift resilience with retry queue
    - Create `SlackInteractionQueue` model/table (Prisma schema) with fields: id, interactionPayload (JSON), responseUrl, failureReason, retryCount, status (pending/delivered/failed), createdAt, nextRetryAt
    - Create `src/lib/slack/interaction-queue.ts` implementing queue logic
    - When a Slack `response_url` delivery fails (e.g., 30-minute response_url window expires, or API errors after retries exhausted in task 22.6), log the failed interaction to the `SlackInteractionQueue` table with failure reason
    - Extend the scheduler tick (task 16.1) to pick up queued interactions with status "pending" and retry delivery; mark as "delivered" on success or "failed" after max retries (5 total attempts)
    - Prevents silent failures: all failed Slack interactions are tracked and retried
    - Write failing tests: failed delivery queues interaction; scheduler tick retries queued items; successful retry marks delivered; exhausted retries marks failed; queue entry contains failure reason
    - _Requirements: 5.12, NFR 1.2_

- [~] 23. Checkpoint - Ensure Slack integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 24. Web interface: feedback form and session pages

  - [~] 24.1 Implement session link landing page
    - Create `src/app/session/[token]/page.tsx`
    - Validate token via API, display questions based on cadence preference
    - Weekly mode: all 5 questions in scrollable view
    - Micro-pulse mode: single unanswered question with expand option
    - Pre-populate previously submitted responses
    - _Requirements: 4.1, 4.2, 4.8_

  - [~] 24.2 Implement feedback form component
    - Create reusable feedback form with Score input (1-5) and optional Trend_Indicator
    - Mobile-friendly from 320px width, no horizontal scrolling
    - Display validation errors per question
    - Retain input on network error for retry
    - _Requirements: 4.3, 4.5, 4.7, 4.10_

  - [~] 24.3 Implement response submission and confirmation
    - Submit responses via POST /api/responses
    - Display confirmation message on success
    - Display rolling average per question after submission
    - Show "session ended" message if session closed
    - _Requirements: 4.6, 4.9, 16.1, 16.5_

  - [~] 24.4 Implement magic link request page
    - Create `src/app/auth/login/page.tsx` with email input
    - POST to magic link request endpoint
    - Display generic success message regardless of email existence
    - _Requirements: 7.1, 7.8_

  - [~] 24.5 Implement magic link verification and genesis flow
    - Create `src/app/auth/magic/[token]/page.tsx`
    - Handle authenticated state: redirect to dashboard
    - Handle genesis state: display team creation form
    - _Requirements: 7.3, 7.9_

- [ ] 25. Web interface: dashboard and team management

  - [~] 25.1 Implement trend dashboard page
    - Create `src/app/teams/[teamId]/dashboard/page.tsx`
    - Display line chart (Y-axis 1.0-5.0) with average score per question per closed session
    - Display "more data needed" if fewer than 2 closed sessions
    - Display response count alongside each average
    - Show trend indicator distribution for most recent session
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8_

  - [~] 25.2 Implement question detail view on dashboard
    - Clicking a question shows average + response count per session
    - Suppress "insufficient data" for sessions below anonymity threshold
    - _Requirements: 8.5, 8.7_

  - [~] 25.3 Implement CSV export button
    - Trigger GET /api/teams/[teamId]/export with optional date range
    - Download as .csv file
    - _Requirements: 8.9, 8.11_

  - [~] 25.4 Implement team management pages
    - Create `src/app/teams/[teamId]/settings/page.tsx`
    - Team name/description editing, privacy mode toggle with confirmation
    - Member list with add/remove, role assignment
    - Schedule configuration form
    - Slack delivery window configuration
    - Display which members have linked Slack identities
    - _Requirements: 1.1, 1.3, 1.6, 1.7, 2.7, 3.1, 14.4, 19.5_

  - [~] 25.5 Implement participation tracking view
    - Create participation component within session detail page
    - Display responded/total counts
    - Show non-responder names according to privacy mode and role rules
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

  - [~] 25.6 Implement user profile and preferences page
    - Create `src/app/me/page.tsx`
    - Cadence preference toggle (weekly/micro-pulse)
    - Reminder enable/disable
    - Availability (mark away) date range picker
    - Personal streak display (de-emphasised)
    - Slack unlink button
    - Delete my data section with confirmation
    - Display current privacy mode when submitting
    - _Requirements: 13.1, 15.1, 15.2, 12.1, 17.1, 17.2, 17.5, 2.6, NFR 4.3, NFR 4.4, 14.7_

  - [~] 25.7 Implement audit log page
    - Create `src/app/teams/[teamId]/audit-log/page.tsx`
    - Display entries chronologically (most recent first) with pagination
    - Delivery_manager access only
    - _Requirements: 18.4, 18.5_

- [~] 26. Checkpoint - Ensure web interface tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 27. Integration wiring and end-to-end flows

  - [~] 27.1 Wire production container to all route handlers
    - Ensure all route handlers import services from `src/lib/container.ts`
    - Verify no service directly imports Prisma
    - _Requirements: (architecture)_

  - [~] 27.2 Implement email service integration (Resend)
    - Create `src/lib/services/email.service.ts`
    - Implement magic link email delivery using Resend SDK
    - Configurable sender address via environment variable
    - _Requirements: 7.1_

  - [~] 27.3 Update CI pipeline
    - Update `.github/workflows/ci.yml` with full pipeline: install → lint → type check → test → build
    - Add Prisma generate and migrate steps
    - _Requirements: (infrastructure)_

  - [~] 27.4 Write integration tests for full response submission flow
    - Test: session link → form render → POST response → upsert → rolling average display
    - Test: Slack interaction → immediate ack → deferred DB write → confirmation
    - _Requirements: 4.1, 4.6, 5.6, 5.8, 16.1_

  - [~] 27.5 Write integration tests for session lifecycle
    - Test: scheduler tick opens session → links generated → tick closes session → aggregates materialised
    - Test: manual open with existing open session closes first
    - _Requirements: 3.2, 3.3, 3.4, 3.9_

  - [~] 27.6 Implement CI requirement coverage check (documentation as code)
    - Create `.github/pull_request_template.md` with a "Requirements Affected" section that prompts developers to tag which Requirement IDs their changes affect (e.g., `Requirement 1.1`, `Requirement NFR 4.5`)
    - Create `scripts/check-requirement-coverage.sh` (or equivalent CI script) that parses the PR description and verifies it contains at least one requirement reference matching the pattern `Requirement \d+\.\d+` or `Requirement NFR \d+\.\d+`
    - Add a CI job step in `.github/workflows/ci.yml` that runs the coverage check on pull_request events and fails the build if no requirement reference is found
    - This keeps the spec docs (requirements.md, design.md) as the living source of truth by enforcing traceability from code changes back to requirements
    - Write failing test: PR description with requirement reference passes; PR description without requirement reference fails; script exits with non-zero code on missing reference
    - _Requirements: (documentation, traceability)_

- [~] 28. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- TDD workflow: write failing test first, implement minimal code to pass, then refactor
- Services use factory injection with in-memory fakes for fast unit tests
- Prisma repositories are tested separately via integration tests against real SQLite
- All route handlers are thin: validate (Zod) → call service → format response
- File size target: <200 lines per file, extract at 300

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.6", "1.7"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5"] },
    { "id": 4, "tasks": ["4.1", "5.1", "7.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2", "5.3", "5.4", "7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["4.4", "4.5", "4.7", "4.9", "7.5", "7.6", "7.7"] },
    { "id": 7, "tasks": ["4.6", "4.8", "8.1"] },
    { "id": 8, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 9, "tasks": ["8.5", "10.1", "10.3", "10.5"] },
    { "id": 10, "tasks": ["10.2", "10.4", "10.6", "10.7", "10.8", "11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 12, "tasks": ["11.5", "12.1", "12.3", "12.5"] },
    { "id": 13, "tasks": ["12.2", "12.4", "12.6", "14.1"] },
    { "id": 14, "tasks": ["14.2", "14.3"] },
    { "id": 15, "tasks": ["14.4", "15.1", "15.4", "16.1"] },
    { "id": 16, "tasks": ["15.2", "15.3", "15.5", "15.6", "16.2"] },
    { "id": 17, "tasks": ["18.1", "18.2", "18.3", "18.4"] },
    { "id": 18, "tasks": ["18.5"] },
    { "id": 19, "tasks": ["19.1", "19.2", "19.3", "19.4"] },
    { "id": 20, "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5"] },
    { "id": 21, "tasks": ["20.6", "20.7", "20.8", "20.9", "20.10"] },
    { "id": 22, "tasks": ["22.1", "22.5"] },
    { "id": 23, "tasks": ["22.2", "22.3", "22.4", "22.6", "22.7"] },
    { "id": 24, "tasks": ["24.1", "24.2", "24.4"] },
    { "id": 25, "tasks": ["24.3", "24.5", "25.1", "25.4"] },
    { "id": 26, "tasks": ["25.2", "25.3", "25.5", "25.6", "25.7"] },
    { "id": 27, "tasks": ["27.1", "27.2", "27.3", "27.6"] },
    { "id": 28, "tasks": ["27.4", "27.5"] }
  ]
}
```
