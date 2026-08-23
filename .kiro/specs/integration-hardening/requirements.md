# Requirements Document

## Introduction

The Team Health Check application has a complete backend (services, repositories, route handlers) and frontend (Next.js pages) that pass 811 unit and property tests in isolation. However, an end-to-end assessment revealed that the layers do not connect properly in a real browser. Components work individually but the integration glue between them is missing or broken.

This spec addresses the critical integration gaps required to make the application functional end-to-end: a real user can open the app in a browser, request a magic link, receive an email, verify it, create a team, add members, configure a schedule, have Slack prompts sent, submit responses via web and Slack, and view trends on the dashboard — all without test mocks.

This spec completes work nominally covered by the original Team Health Check spec (`.kiro/specs/team-health-check/`) but not functional in an integrated environment.

## Glossary

- **Session_Token**: A cryptographic token returned by magic link verification (or session-link validation) that authenticates the user for subsequent API requests. Stored as an httpOnly cookie and sent automatically by the browser.
- **Auth_Helper**: A route-handler-level function (`withAuth` or `getAuthContext`) that extracts and validates the Session_Token from the request cookie, queries the UserSession table via Prisma, and returns the authenticated identity (memberId). Runs in Node.js API route runtime (not Edge middleware).
- **Auth_Context**: The authenticated browser identity containing only `memberId`, derived from a valid Session_Token by the Auth_Helper. `Auth_Context.memberId` is authoritative; caller-controlled identity headers are never trusted or synthesized.
- **API_Contract**: The agreed-upon shape of request and response payloads between the frontend and backend layers.
- **Integration_Test**: A test that exercises a complete user flow through multiple layers (browser → API → service → database) without mocks.
- **Slack_Identity_Link_Record**: A persistent database record mapping a Team_Member's system identity to their Slack user ID, stored via the SlackIdentityLink Prisma model.
- **Notification_Wiring**: The connection between event triggers (scheduler tick, session open) and the NotificationService that dispatches Slack/email prompts.
- **Turso**: A SQLite-compatible serverless database (libSQL over HTTP) used for production deployment on Vercel. Local development continues to use a SQLite file via better-sqlite3.

## Requirements

### Requirement 1: Session Token Storage and Transmission

**User Story:** As a team member who has verified a magic link, I want my authenticated session to persist across page navigations and API calls, so that I do not need to re-authenticate on every request.

*Completes original spec requirements 7.2, 7.3 (session establishment after magic link verification).*

#### Acceptance Criteria

1. WHEN the Magic_Link verification endpoint returns a successful authentication result containing a sessionToken, THE server SHALL set the Session_Token as an httpOnly cookie via a `Set-Cookie` response header with a SameSite attribute of "lax" and a max-age matching the session duration (7 days). THE cookie SHALL set the Secure flag only when the application is running over HTTPS (i.e., when `NODE_ENV === 'production'` or `NEXT_PUBLIC_APP_URL` starts with `https://`), so that local development over HTTP on localhost is not affected by browsers dropping the cookie.
2. WHEN the browser makes any API request to a protected endpoint, THE Auth_Helper SHALL extract the Session_Token from the cookie and validate it against the UserSession table via Prisma.
3. WHEN a valid Session_Token is found, THE Auth_Helper SHALL populate the Auth_Context with the associated memberId and make it available to the route handler.
4. IF the Session_Token is missing, expired, or does not match a valid UserSession record, THEN THE Auth_Helper SHALL return an HTTP 401 response with a generic error message.
5. WHEN the genesis flow (team creation for new users) completes successfully and returns a sessionToken, THE server SHALL set the cookie using the same `Set-Cookie` mechanism as criterion 1.
6. THE server SHALL clear the Session_Token cookie (set max-age to 0) when the user explicitly logs out or when the session is invalidated.

### Requirement 2: Auth Protection for API Routes

**User Story:** As the system, I want all protected API routes to consistently authenticate requests via the session cookie, so that the `x-member-id` and `x-user-id` header pattern is eliminated and real browsers can access protected endpoints.

*Completes original spec requirements 7.3, 17.1 (authenticated session, role-based access).*

#### Acceptance Criteria

1. THE Auth_Helper SHALL be applied (via a `withAuth` wrapper or direct `getAuthContext` call) to protected browser route handlers under `/api/me/*`, `/api/teams/*`, and `/api/responses`.
2. WHEN the Auth_Helper validates a Session_Token, IT SHALL look up the associated memberId from the UserSession table and attach it to the Auth_Context.
3. Auth_Context.memberId SHALL be the sole authoritative browser identity. THE Auth_Helper SHALL NOT trust, copy, or synthesize `x-member-id`, `x-user-id`, `x-team-id`, or `x-session-id` identity headers.
4. ALL protected route handlers SHALL pass `Auth_Context.memberId` directly to authorization and service functions; caller-controlled identity headers SHALL NOT alter the authenticated member.
5. THE `/api/responses` route SHALL read memberId from Auth_Context and sessionId from the validated request body.
6. IF a route handler receives a request without a valid Auth_Context (no valid session cookie) and the route is not exempt, THEN THE Auth_Helper SHALL reject the request with HTTP 401.
7. Intentional cookie-auth exemptions are limited to bootstrap or externally authenticated entry points: magic-link tokens, session-link tokens, genesis tokens, verified Slack signatures, and scheduler `CRON_SECRET`. Each exempt route SHALL validate its named credential and SHALL NOT treat caller-supplied identity headers as authentication.
8. THE Auth_Helper SHALL run in Node.js runtime (inside API route handlers), NOT in Next.js Edge middleware, ensuring compatibility with Vercel serverless deployment and Prisma/Turso database access.

### Requirement 3: API Response Contract Alignment — Session Link

**User Story:** As a team member accessing a session link, I want to receive all the data needed to render the response submission page in a single API call, so that the UI does not need to make additional requests that may fail.

*Completes original spec requirement 6.3 (session link validation returns context).*

#### Acceptance Criteria

1. WHEN a valid Session_Link token is accessed, THE `/api/auth/session-link/[token]` endpoint SHALL return a response containing: memberId, sessionId, memberName, cadencePreference, `questions` (the cadence-selected Questions), `allQuestions` (the complete list of Questions with id, title, description, and displayOrder), `expandable`, and any existing Responses (field name: `responses`) for that member in that session.
2. WHEN cadencePreference is `micro_pulse`, `questions` SHALL contain the weighted unanswered selection and MAY be empty when all questions are answered; `expandable` SHALL equal whether `questions` omits any entry from `allQuestions`. For every other cadence, `questions` SHALL equal `allQuestions` and `expandable` SHALL be false.
3. IF the session is closed, THE response SHALL include a sessionStatus field set to "closed" so the UI can display an appropriate message without a separate API call.
4. WHEN the Session_Link is validated successfully, THE endpoint SHALL create a UserSession for the associated member (or reuse an existing active session) and set the session cookie via `Set-Cookie` header, so that subsequent API calls (e.g., `POST /api/responses`) from the same browser are authenticated without requiring a separate magic-link login.
5. THE session created by session-link validation SHALL have a max-age equal to the remaining time until the health check session closes (or 7 days, whichever is shorter), reflecting that session-link authentication is scoped to the active session.

### Requirement 4: API Response Contract Alignment — Trends

**User Story:** As a delivery manager viewing the trends dashboard, I want the trends API to return data grouped by session with trend indicator distributions, so that the UI can render session-over-session comparisons without client-side transformation.

*Completes original spec requirement 8.1, 8.4 (trend visualisation data shape).*

#### Acceptance Criteria

1. WHEN the `/api/teams/[teamId]/trends` endpoint is called, THE endpoint SHALL return a response containing: a `sessions` array (each with sessionId, closedAt, and an `averages` array with per-question averageScore and responseCount), a `trendDistribution` array for the most recent closed session (each element with questionId, improving, stable, declining counts), and the team `privacyMode`.
2. WHEN fewer than two closed sessions exist, THE response SHALL include an empty `sessions` array and a `trendDistribution` of an empty array, along with a `requiresMoreData` flag set to true.
3. THE `sessions` array SHALL be ordered chronologically (oldest first) to align with the X-axis rendering expectation of the trend chart.

### Requirement 5: API Response Contract Alignment — Response Submission

**User Story:** As a team member submitting responses via the web interface, I want to include my session context in the request body, so that the submission works without relying on custom headers that the browser does not set.

*Completes original spec requirements 4.4, 4.6 (response submission).*

#### Acceptance Criteria

1. WHEN a Team_Member submits responses via the Web_Interface, THE `/api/responses` endpoint SHALL accept a JSON body containing `sessionId` and an array of `responses` (each with questionId, score, and optional trendIndicator).
2. THE `/api/responses` endpoint SHALL read the memberId from the Auth_Context (session cookie validated by Auth_Helper) and the sessionId from the request body.
3. THE `/api/responses` endpoint SHALL no longer require or read the `x-member-id` or `x-session-id` headers for browser-originated requests.
4. WHEN submission succeeds, THE endpoint SHALL return the saved responses with their rolling averages, matching the shape expected by the UI: `{ responses: [{ questionId, score, trendIndicator, rollingAverage }] }`.

### Requirement 6: Magic Link Email Delivery

**User Story:** As a team member requesting a magic link, I want an email to actually arrive in my inbox with a clickable link, so that I can authenticate and access the application.

*Completes original spec requirement 7.1 (magic link email delivery).*

#### Acceptance Criteria

1. WHEN the `requestMagicLink` function in AuthService persists a magic link token (for existing members) or a pending genesis token (for new users), THE AuthService SHALL call the EmailService to send the magic link email to the provided address.
2. THE email SHALL contain a URL in the format `{NEXT_PUBLIC_APP_URL}/auth/magic/{token}` that the recipient can click to verify.
3. IF the EmailService call fails (network error, API error), THEN THE AuthService SHALL log the failure but still return successfully to the caller (anti-enumeration: the user must not be able to determine whether email sending succeeded).
4. THE EmailService dependency SHALL be injected into the AuthService via the existing factory pattern, maintaining testability with the InMemoryEmailService fake.

### Requirement 7: Slack Identity Persistence

**User Story:** As a team member who has successfully verified a pairing code, I want my Slack identity link to be stored permanently in the database, so that the mapping survives server restarts and I continue receiving Slack prompts.

*Completes original spec requirements 2.4, 2.5 (pairing code verification persists link).*

#### Acceptance Criteria

1. WHEN `verifyPairingCode` succeeds (code is valid, unexpired, unused), THE AuthService SHALL create a SlackIdentityLink record in the database associating the memberId with the returned slackUserId.
2. IF a SlackIdentityLink already exists for the given memberId, THEN THE AuthService SHALL update the existing record with the new slackUserId rather than creating a duplicate.
3. THE Slack interactions route (`/api/slack/interactions`) SHALL resolve Slack user IDs to memberIds by querying the SlackIdentityLink table via a repository, replacing the in-memory Map.
4. THE Slack commands route (`/api/slack/commands`) SHALL implement the `/healthcheck` command (currently a TODO stub) by querying the SlackIdentityLink table to identify the member and returning appropriate health check prompts or a "no active session" message.

### Requirement 8: Notification Service Wiring

**User Story:** As a team member with a linked Slack identity, I want to receive Slack prompts when a session opens and closing reminders before it ends, so that I am reminded to participate without checking the web app.

*Completes original spec requirements 5.2, 13.1, 13.2, 13.3 (prompt and reminder delivery).*

#### Acceptance Criteria

1. WHEN the scheduler tick opens a new Health_Check_Session, THE scheduler SHALL invoke the NotificationService to send Slack prompts to all eligible team members (those with Slack links, not marked away, with appropriate cadence).
2. WHEN a closing reminder is due (configurable lead time before session close, default 24 hours), THE scheduler SHALL invoke the NotificationService to send closing reminders to members who have not completed all questions.
3. THE NotificationService SHALL be wired in the scheduler tick route with a production NotificationSink that calls the Slack API (using the SLACK_BOT_TOKEN) to deliver messages.
4. THE NotificationService SHALL be wired with a production SlackLinkChecker that queries the SlackIdentityLink repository instead of using a stub or in-memory check.
5. IF a Slack API call fails during prompt delivery, THEN THE NotificationService SHALL persist the failed interaction to the SlackInteractionQueue for retry on subsequent scheduler ticks (per original requirement 5.13).

### Requirement 9: Authorization on Read Endpoints

**User Story:** As the system, I want read endpoints for team details, trends, and member lists to verify that the requester belongs to the team, so that team data is not accessible to unauthenticated or unauthorized users.

*Completes original spec requirement 17.1 (role-based access control).*

#### Acceptance Criteria

1. WHEN a request is made to `/api/teams/[teamId]`, `/api/teams/[teamId]/trends`, `/api/teams/[teamId]/members`, or `/api/teams/[teamId]/sessions`, THE Auth_Helper SHALL verify that the authenticated member belongs to the specified team.
2. IF the authenticated member does not belong to the requested team, THEN THE route handler SHALL return an HTTP 403 response indicating insufficient permissions.
3. WHEN a request is made to any team-scoped read endpoint without a valid Auth_Context, THE Auth_Helper SHALL return an HTTP 401 response.
4. THE `/api/teams/[teamId]/audit-log` endpoint SHALL additionally verify that the authenticated member holds the delivery_manager role for that team before returning results.

### Requirement 10: End-to-End Acceptance Test

**User Story:** As a developer, I want a Playwright test that proves the full happy path works in a real browser, so that integration regressions are caught before deployment.

*Validates the integrated system against original spec requirements 4.1, 6.3, 7.1, 7.2, 7.3, 8.1.*

#### Acceptance Criteria

1. THE test suite SHALL include a Playwright test that exercises the complete flow: request magic link → verify token → create team (genesis) → add member → open session → submit responses → view dashboard with trends.
2. THE Playwright test SHALL use a test email interceptor (not a real email provider) to capture the magic link token programmatically and navigate to the verification URL.
3. THE Playwright test SHALL verify that after magic link verification, the session cookie is set and subsequent navigations to protected pages succeed without re-authentication.
4. THE Playwright test SHALL verify that response submission results in data visible on the trends dashboard (requires at least two sessions to show trend lines, or verifies the "needs more data" state for a single session).
5. THE test suite SHALL run in CI without requiring external services (Slack, email) by using interceptors or test mode configuration.
6. THE `.github/workflows/ci.yml` SHALL include a Playwright job that runs after the build step, using `TEST_MODE=true` environment configuration.

### Requirement 11: Repository Hygiene

**User Story:** As a developer, I want the codebase to reflect its actual identity and not contain leftover scaffolding, so that onboarding and maintenance are straightforward.

*Addresses tech debt that causes confusion during development and deployment.*

#### Acceptance Criteria

1. THE package.json `name` field SHALL be updated from "nextjs-fullstack-starter" to "team-health-check".
2. THE `/api/items` route and its sub-routes SHALL be removed from the codebase, as they are leftover scaffolding not used by the application.
3. THE AI_CONTEXT.md file SHALL be updated to accurately reflect the current state of the project, removing references to "Outstanding Work" items that have been completed and adding references to the integration-hardening spec.
4. THE README.md "Stack" section SHALL accurately reflect the Next.js version used (16.x per package.json, not 15 as currently stated in some documentation references).

### Requirement 12: MSW Mock Alignment

**User Story:** As a developer, I want the MSW handlers used in UI tests to match the actual API contracts implemented during integration hardening, so that passing UI tests reflect real system behaviour rather than stale mocked shapes.

*Prevents false confidence from 811 tests passing against outdated mock contracts.*

#### Acceptance Criteria

1. WHEN integration hardening changes the response shape of any API endpoint, THE corresponding MSW handlers in `src/tests/mocks/` SHALL be updated to return the new shape.
2. THE UI component tests that consume mocked API responses SHALL continue to pass after MSW handler updates, confirming the UI is compatible with the actual API contracts.
3. IF a UI component test fails after an MSW handler update, THE UI component SHALL be updated to match the new contract (not the mock reverted to the old shape).
4. THE following endpoint mocks SHALL be verified and aligned: `/api/auth/session-link/[token]` (field: `responses` not `existingResponses`), `/api/teams/[teamId]/trends` (fields: `closedAt`, `averages[]`, `trendDistribution` as array), and `/api/responses` (body-based auth, no header requirements).

### Requirement 13: Production Database Wiring (Turso)

**User Story:** As a developer deploying to Vercel, I want the application to use Turso (libSQL) in production while continuing to use local SQLite for development, so that the app works on Vercel's serverless platform without a persistent filesystem.

*Implements the deployment strategy defined in the original Team Health Check design doc.*

#### Acceptance Criteria

1. THE `src/lib/prisma.ts` module SHALL be environment-aware: using `better-sqlite3` adapter with a local file (`prisma/dev.db`) when `TURSO_DATABASE_URL` is not set, and using `@libsql/client` with `@prisma/adapter-libsql` when `TURSO_DATABASE_URL` is set.
2. THE production Prisma client SHALL connect to Turso using the `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables.
3. THE existing repository implementations SHALL work without modification against both the local SQLite and Turso-backed Prisma client (no query dialect changes required).
4. THE project SHALL include documentation (in README.md) for setting up a Turso database and configuring the Vercel environment variables.
5. THE `prisma/schema.prisma` SHALL retain the `sqlite` provider, as Turso is SQLite-compatible and requires no schema dialect change.
