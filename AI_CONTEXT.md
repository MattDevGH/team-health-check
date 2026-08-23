# AI Session Context

> Read this at the start of every session to resume without re-discovery.
>
> **Mandatory update rule:** Update both AI_CONTEXT.md and README.md as part of
> any commit that changes project structure, behaviour, test coverage, or conventions.

---

## Project

Team Health Check — a lightweight feedback tool for delivery teams, inspired by the Spotify Squad Health Check Model. Collects regular health-check responses via web interface and Slack bot, visualises trends over time.

**Repo:** https://github.com/MattDevGH/team-health-check.git

**Branch policy:** `master` is the stable/default branch. Feature work uses
`feat/<feature-name>` branches and merges through a pull request only after CI
and relevant acceptance validation pass.

**Current branch status:** Integration hardening remains open on
`feat/integration-hardening`. This branch contains the approved one-off
browser-acceptance consolidation checkpoint; preserve it and the persistent
`prisma/dev.db`, and do not start the lifecycle-management milestone yet.
Two-session browser acceptance is complete, but the 2026-08-23 closure audit
found unsupported completion claims in auth, Slack production wiring,
Playwright/isolation, MSW contracts, and libSQL evidence. Tasks 23–26 in the
integration-hardening spec are now the authoritative merge plan.

## Latest Manual Acceptance Checkpoint — 2026-08-23

**Resume cue:** Browser acceptance through the first two health-check sessions
is complete. Do not recreate those sessions or repeat those scenarios unless a
regression requires it. Preserve the current worktree and persistent
`prisma/dev.db`. Resume Task 23.2 with participation GET authorization, then
continue in the recorded commit order. Follow the remaining Tasks 23–26
afterward; do not begin the deferred lifecycle-management or dashboard-UX
milestones first.

### Accepted live state

- Team: `cmt4sfyxs0001fc0f3v6uecya` — **Browser Validated Team**
- Member/Delivery Manager: `mattheptinstall`
- First session `cmt4w7ugx0007ek0frb2zmfqm`: closed/materialised with scores
  `4/5/3/3/4` and subjective trends
  `improving/none/none/none/stable`.
- Second session `cmt4y3aj50005aw0fv5ay2m0o`: closed/materialised with scores
  `5/4/3/4/2` and subjective trends
  `stable/declining/none/improving/improving`.
- Both close PATCH requests and scheduler ticks returned 200. Each session has
  five one-response aggregates with the expected averages and trend counts.
- Calculated score movement across sessions is `up/down/flat/up/down`; the
  subjective trend distribution remains independent, including the deliberate
  mismatches for Delivering Value and Psychological Safety.
- Both participant links immediately render **Session Ended** after close.
- The dashboard correctly changed from **More data needed** after one closed
  session to two-session chart/detail data after the second. Latest counts,
  subjective distributions, and question drill-down values all matched the API.
- User reported no browser errors; dev-server logs contained successful 200
  requests only.
- Current managed dev server: `term_1787437157697_j206ug48n7`. It uses an
  ephemeral process-only `CRON_SECRET`; `.env` has a blank value. After restart,
  configure a non-empty local secret and restart before testing scheduler ticks.

### Deferred dashboard UX improvements from live acceptance

1. **Chart clarity:** Add a descriptive chart title and short explanation. Make
   question-to-line mapping obvious with at least a legend. Consider accessible
   line/data-point detail: hover **and keyboard focus** should emphasise the
   series and expose question name, score, date, response count, and useful
   aggregate context. Do not expose participant attribution without an explicit
   privacy-aware product decision and supporting data contract.
2. **Latest Session purpose:** It currently repeats only response counts, so its
   intent as a sample-size/confidence indicator is unclear and its standalone
   value is weak. Either remove/merge it or redesign it with the session date,
   average score, change from the prior session, response count, and explanatory
   copy. Fix singular/plural wording (`1 response`, not `1 responses`).
3. **Question disclosure affordance:** Make it obvious that question rows expand.
   Add introductory text and/or a chevron, visible expanded/collapsed state, and
   `aria-expanded`/`aria-controls` semantics. Preserve keyboard operation.

Implement these later as separate TDD vertical slices rather than one dashboard
rewrite. No production changes were made for these UX observations yet.

### Acceptance status

1. Open and verify second session/link — complete.
2. Collect and refresh-persist changed feedback — complete.
3. Close/materialise and verify calculated + subjective data — complete.
4. Validate the two-session dashboard and drill-downs — complete.

### Integration-hardening closure audit — authoritative next work

The original Tasks 1–21 were checked too early. Task 20.1 and the final
checkpoint are reopened; Task 22 records the accepted regressions above. Complete
these dependency-ordered waves before commit/merge or a new milestone:

1. **Task 23 — Auth/session and audit closure:** authorize the remaining
   participation route; amend requirements/design so direct AuthContext—not
   injected identity headers—is authoritative; implement micro-pulse selection;
   scope reused session-link auth to close/expiry; and emit the still-missing
   schedule-change and member-addition audit records. Persisted logout/cookie
   clearing, authenticated member-scoped team collection GET/POST and exports,
   and team-bound session-detail reads are complete.
2. **Task 24 — Slack production closure:** authenticated pairing UI and actual
   unlink; actionable `/healthcheck`; cadence/delivery-window eligibility;
   scheduler closing reminders; persistent retry queue/drain; then redacted
   disposable-workspace acceptance covering signatures, prompts, interactions,
   browser fallback, reminder, retry, persistence, and cleanup.
3. **Task 25 — Automated/deployment evidence:** isolated seeded E2E database;
   TEST_MODE-only email capture that fails rather than skips; browser-managed
   auth and two complete Playwright lifecycles; expanded axe coverage; canonical
   MSW response identity contract; executable local libSQL repository behavior;
   CI enforcement of isolation/seeding/zero required skips.
4. **Task 26 — Reconciliation and merge:** keep requirements/design/tasks,
   README, and AI_CONTEXT synchronized; run clean lint/type/Vitest/build/E2E,
   libSQL, Slack, and diff gates; commit/push this branch; obtain green `ci`,
   `e2e`, and `requirement-coverage` PR jobs; merge before branching new work.

### Commit boundaries from Task 23 onward

The browser-acceptance checkpoint is a one-off consolidation exception. After
it, commit each green testable behavior before starting the next. Task 23 is
expected to land as these independent conventional commits (split further if a
slice stops being reviewable):

1. `fix: invalidate authenticated sessions on logout` — Task 23.1 complete in this checkpoint.
2. `fix: authenticate team collection routes` — `/api/teams` GET/POST portion of Task 23.2 complete in this checkpoint.
3. `fix: authorize team data exports` — export portion of Task 23.2 complete in this checkpoint.
4. `fix: protect session detail reads` — session-detail GET portion of Task 23.2 complete in this checkpoint.
5. `fix: replace participation header authentication` — participation and URL ownership portion of Task 23.2.
6. `docs: make direct auth context authoritative` — requirements/design plus contract regression for Task 23.3.
7. `feat: select weighted micro-pulse questions` — first half of Task 23.4.
8. `fix: scope reused session-link authentication` — second half of Task 23.4.
9. `fix: audit schedule configuration changes` — first half of Task 23.5.
10. `fix: audit team member additions` — second half of Task 23.5.

Each slice includes its red/green tests, required README and AI_CONTEXT updates,
and targeted validation. Do not wait for all of Task 23 to commit or leave a
green slice uncommitted while beginning the next one.

Current known blockers are implementation gaps, not merely missing manual proof:
participation still trusts `x-user-id` and needs consistent URL ownership
protection; micro-pulse and reused-close scoping are incomplete; schedule changes
and member additions still omit required audit entries; pairing accepts caller
memberId and unlink does not
delete; scheduler omits closing reminders and uses a request-local retry queue;
required Playwright tests can skip through a nonexistent token endpoint and use
unseeded/non-isolated data; the response MSW body remains stale; Turso selection
lacks repository execution evidence.

Explicitly deferred non-blockers: session lifecycle management UI; dashboard
chart/Latest Session/question-disclosure UX; `app_mention`/`message.im` behavior
if those subscriptions remain undocumented; broader design-system, navigation,
CSRF, generalized rate-limiting, performance, and telemetry work.

### Changes and validation already completed

- Session-detail GET authenticates from the persisted session cookie, authorizes
  ordinary membership in the requested URL team, and resolves sessions through
  `SessionService.get(teamId, sessionId)`, which returns the same 404 for missing
  and cross-team sessions. Existing Delivery Manager-only PATCH behavior is
  unchanged.
- `/api/teams/[teamId]/export` authenticates from the persisted session cookie,
  authorizes the cookie member against the requested URL team, and returns the
  same non-leaking 403 for foreign or nonexistent teams before export work.
  Existing aggregate-only CSV, privacy suppression, and date-range behavior is
  unchanged.
- `/api/teams` GET/POST now authenticate before request processing. GET returns
  only the cookie member's team; POST derives creator/member/role/audit identity
  from AuthContext and ignores spoofed identity inputs. Team creation persists
  the team/member/manager-role/audit graph in one repository operation: Prisma
  uses a transaction and the in-memory fake synchronously claims the creator, so
  concurrent or sequential second-team attempts return typed 409 without
  partial state.
- `POST /api/auth/logout` idempotently revokes the exact presented UserSession
  token and returns 204 with a matching httpOnly `Max-Age=0` clear-cookie header;
  missing, unknown, and expired tokens do not leak validity or block clearing.
- Team settings acceptance fixes: null time inputs, Slack delivery persistence +
  success feedback, complete-pair validation, authenticated before/after audit;
  privacy persistence/audit + success feedback; cookie-auth schedule persistence
  + success feedback; and final-Delivery-Manager safety.
- Feedback trends are accessible toggle buttons: optional trends can be cleared;
  required score radios cannot.
- Session close PATCH now uses cookie auth and Delivery Manager authorization,
  not spoofable `x-user-id`; `SessionService.close` enforces the URL team/session
  ownership invariant.
- A closed link now renders **Session Ended** immediately from the existing
  `sessionStatus` API field, while retaining the 409 fallback for pages already
  open at close time.
- Both live closes and scheduler ticks returned 200, all ten expected
  aggregates were verified, and the trends API correctly transitioned from the
  one-session threshold response to two-session data.
- Latest validation: **121 test files / 1006 tests passed**,
  `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`
  all passed.
- Temporary local execution scripts were deleted. The approved consolidation
  checkpoint preserves the accepted fixes; run `git status --short` before
  starting the Task 23.2 participation authentication and URL-binding slice.

---

## Stack

| Layer       | Choice                        | Notes |
|-------------|-------------------------------|-------|
| Framework   | Next.js 16 (App Router)       | Read node_modules/next/dist/docs/ before writing Next-specific code |
| Language    | TypeScript (strict)           | No JS files in src/. No `any` types. |
| ORM         | Prisma 7 + better-sqlite3     | Driver adapter pattern. Config in prisma.config.ts |
| DB (dev)    | SQLite (prisma/dev.db)        | Gitignored. Run: npx prisma migrate dev --name init |
| DB (prod)   | Turso (libSQL)                | SQLite-compatible serverless DB. @prisma/adapter-libsql |
| Email       | Resend                        | Magic link delivery. Free tier: 100/day |
| Hosting     | Vercel (free tier)            | Serverless functions, cron jobs, preview deploys |
| Styling     | Tailwind CSS v4               | PostCSS plugin (@tailwindcss/postcss) |
| Validation  | Zod                           | Runtime validation, single source of truth for input shapes |
| Testing     | Vitest + RTL + msw + jest-axe + fast-check + Playwright | See Testing section |
| CI          | GitHub Actions                | .github/workflows/ci.yml |

---

## Architecture

```
Route Handler (thin) → Service (business logic) → Repository (data access) → Prisma → SQLite
```

- **Repository pattern**: Services depend on repository interfaces, not Prisma directly
- **Factory injection**: `createXService({ xRepo, yRepo })` — no DI container
- **In-memory fakes**: For unit tests, services use in-memory repository implementations
- **Typed errors**: All errors extend `AppError` base class with `code` and `statusCode`

---

## File Structure

```
src/
  app/
    api/                    # Route handlers (thin controllers)
      teams/               # Team CRUD, members, sessions, schedule, trends, export, audit
      responses/           # Response submission (cookie auth, body-based sessionId)
      auth/                # Session links, magic links, Slack pairing
      slack/               # Events, interactions, commands (/healthcheck)
      scheduler/           # Cron-triggered session lifecycle + notification dispatch
      me/                  # User profile, preferences, availability, streak, data deletion
    page.tsx
    layout.tsx
    globals.css
  lib/
    auth/                  # Auth helpers: session-cookie, with-auth, authorize-team-member
    services/              # Business logic (factory functions)
    repositories/
      types.ts             # Repository interfaces (incl. SlackIdentityLinkRepository)
      prisma/              # Production implementations
      in-memory/           # Test fakes
    slack/                 # Slack delivery, message builder, notification sink, link checker
    validation/            # Zod schemas
    prisma.ts              # Environment-aware PrismaClient (Turso or better-sqlite3)
    container.ts           # Service factory with optional EmailService
    container-production.ts # Production wiring (Prisma repos + Resend email)
    rate-limit.ts          # Rate limiting utility
    api-utils.ts           # withErrorHandling wrapper
    errors.ts              # AppError, ForbiddenError, NotFoundError, etc.
  tests/
    setup.ts               # msw server lifecycle
    mocks/                 # msw handlers (aligned to actual API contracts)
    properties/            # Property-based tests (fast-check)
    unit/services/         # Service unit tests (in-memory repos)
    unit/validation/       # Schema tests
    integration/           # Real database tests
    ui/                    # Component + accessibility tests
e2e/                       # Playwright browser tests (happy-path, accessibility)
prisma/
  schema.prisma            # Domain models (Team, TeamMember, Session, Response, etc.)
  seed.ts                  # Fixed 5 questions
prisma.config.ts           # Prisma 7 datasource config
```

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Repository interfaces between services and Prisma | Enables TDD with sub-ms tests using in-memory fakes |
| Factory functions for DI (no container) | Simple, explicit, appropriate for project size |
| Thin route handlers | SRP — no business logic in API routes |
| Materialised aggregates at session close | Enables GDPR data deletion without affecting trends |
| Lazy materialisation via scheduler tick | Survives serverless function timeouts (no setTimeout) |
| In-memory rate limiting | Avoids TOCTOU race condition, no SQLite write contention |
| date-fns-tz for scheduling | DST-safe UTC calculation for session open/close times |
| Genesis flow with CAS token | Atomic team creation for unknown emails, prevents double-submit |
| Session links + Magic links (no OAuth) | Minimises friction for feedback submission |
| Vercel + Turso (no containers) | Zero-ops deployment, SQLite compatibility preserved |
| Resend for email | Simple, free tier sufficient, Vercel integration |
| Zod for validation | Runtime type safety, co-located schemas |
| fast-check for property tests | Formal correctness properties from design doc |
| Route-handler auth helper (`withAuth`) over Edge middleware | Vercel Edge Runtime can't run Prisma/Turso; route handlers run in Node.js |
| Cookie-based session over Authorization header | Browsers set cookies automatically; no client-side token management |
| SlackIdentityLinkRepository (DB-backed) | Replaces in-memory Map; persists across server restarts |
| Stable member-summary API contract | TeamService assembles roles and optional Slack link through injected repositories; UI normalizes legacy omissions |

---

## Development Workflow (TDD)

1. Write failing test (Red)
2. Write minimal code to pass (Green)
3. Refactor (clean up, both test and production code)
4. Repeat

**Watch mode**: `npm run test:watch` — runs unit tests only (fast feedback)
**Full suite**: `npm test` — includes property tests
**E2E**: `npx playwright test` — runs against built app

---

## Testing Layers

| Layer | Tool | Speed | Scope |
|-------|------|-------|-------|
| Unit (services) | Vitest + in-memory repos | <1ms/test | Business logic |
| Property | Vitest + fast-check | ~100ms/property | Correctness invariants |
| Integration | Vitest + real SQLite | ~50ms/test | Data layer, full flows |
| UI/A11y | Vitest + RTL + jest-axe | ~100ms/test | Components, WCAG |
| E2E | Playwright | ~2-5s/flow | Browser user flows |

The Vitest suite now contains **1006 tests across 121 files**, including
cookie-authenticated, team-bound session-detail reads with non-leaking failures,
requested-team-scoped CSV exports, persisted logout/session-cookie clearing,
member-summary contracts, member
mutation authorization/final-manager protection, optional trend toggles,
authenticated complete-pair delivery-window audit/validation, cookie-auth
session close/team binding, and closed-link initial-render regressions.

---

## CI Pipeline (GitHub Actions)

**Job 1 (`ci`):** Install → Lint → Type Check → Unit+Property Tests → Build
**Job 2 (`e2e`):** Install → Build → Playwright E2E Tests (depends on `ci`)
**Job 3 (`requirement-coverage`):** PR description coverage check (on PRs only)

All stages must pass. Branch protection requires CI green before merge.

---

## Conventions

- Conventional commits: `feat:` `fix:` `test:` `docs:` `chore:`
- File naming: kebab-case
- Functions/variables: camelCase
- Types/components: PascalCase
- Constants: UPPER_SNAKE_CASE
- Max file length: 200 lines preferred, extract at 300
- Max function length: 30 lines
- Imports grouped: external → internal → relative (blank lines between)
- No circular imports between service modules
- JSDoc only for exported public APIs

---

## Spec Status

### Original spec: `.kiro/specs/team-health-check/`
- `requirements.md` — 20 requirements + 4 NFRs (complete, includes Slack retry queue and GDPR audit specifics)
- `design.md` — Architecture, data models, 34 correctness properties, testing strategy, SOLID, TDD, SlackInteractionQueue, documentation-as-code CI (complete)
- `tasks.md` — 28 task groups, ~120 sub-tasks including property tests (complete)

### Open spec: `.kiro/specs/integration-hardening/`
- `requirements.md` — 13 requirements covering auth/cookie foundation, session-link enrichment, response submission, protected routes, notification wiring, Slack identity, Turso production DB, E2E tests, MSW alignment, and repo hygiene
- `design.md` — Integration architecture, 12 correctness properties, auth helper design, cookie scoping, notification sink pattern; Task 23.3 must reconcile its identity-header wording with direct AuthContext
- `tasks.md` — Tasks 1–21 record the original pass, Task 22 records completed acceptance regressions, and open Tasks 23–26 define auth/session, Slack, automated evidence, and final merge closure
- Do not mark this spec complete or create the lifecycle-management spec until Tasks 23–26 and the final PR gates pass

---

## Auth Architecture (Post-Integration-Hardening)

- **Cookie-based sessions**: Magic link verification, genesis completion, and session-link validation set the `session` httpOnly cookie
- **Persisted logout**: `POST /api/auth/logout` deletes only the presented UserSession token and returns an idempotent 204 with the environment-aware clear-cookie header
- **Authenticated team collection**: `/api/teams` GET is member-scoped; POST uses only cookie AuthContext for creator/member/role/audit identity and atomically returns 409 for concurrent or sequential second-team attempts without partial persistence
- **New-user genesis claim ownership**: Magic-link verification reads and validates unused/unexpired `PendingGenesis` records without mutation; genesis execution performs the only CAS claim, persists validated team name/description, and establishes the browser session
- **`getAuthContext`**: Factory function (`createGetAuthContext`) extracts + validates session cookie against UserSessionRepository
- **`withAuth`**: Factory-created HOF wrapper that enforces auth on route handlers (401 if invalid)
- **`authorizeTeamMember`**: Factory function verifying member belongs to requested team (403 if not)
- **`authorizeDeliveryManager`**: Extends team membership check with delivery_manager role requirement
- **Protected routes**: `/api/me/*`, `/api/teams` GET/POST, team exports, session details, responses, and core team settings/trends/member/session routes use cookie auth; Task 23.2 still covers participation GET and its URL ownership checks
- **Member management**: GET/POST/PATCH return a stable member-summary DTO; delivery managers can add, replace roles, and remove members with final-manager protection
- **Slack identity**: Prisma-backed SlackIdentityLink lookup persists mappings, but authenticated pairing UI and truthful deletion/unlink remain Task 24.1 blockers
- **Notification wiring**: Newly-opened prompts reach NotificationService and the production Slack sink; cadence/window eligibility, closing reminders, persistent retry storage, and later-tick draining remain Task 24 blockers
- **Turso**: Environment-aware Prisma client selection exists (better-sqlite3 locally, @libsql/client in production); executable repository behavior through local libSQL remains Task 25.5

---

## Hooks

- `requirement-traceability` (postTaskExecution) — reminds agent to tag Requirement IDs in source files and commit messages after each task

---

## Outstanding Work

### Integration-hardening merge blockers

- Task 23: auth/session contract closure
- Task 24: Slack production behavior and real-workspace acceptance
- Task 25: deterministic non-skipping E2E/MSW/libSQL evidence
- Task 26: documentation, full gates, commit/push/PR/merge

### Deferred follow-up milestones

- Session lifecycle management UI and explicit materialisation state
- Dashboard chart clarity, Latest Session redesign, and question affordances
- Design system / component library, dark mode, responsive shared navigation
- CSRF protection and generalized non-auth rate limiting
- Load/performance testing and operational telemetry
- Optional Slack conversational events and richer interaction feedback beyond Requirements 7–8
