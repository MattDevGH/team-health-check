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

**Current branch status:** Integration hardening is on
`feat/integration-hardening`, pending full automated validation, real browser
and Slack acceptance validation, and a pull request. It must not be merged to
`master` until that validation is complete.

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

### Completed spec: `.kiro/specs/integration-hardening/`
- `requirements.md` — 13 requirements covering auth/cookie foundation, session-link enrichment, response submission, protected routes, notification wiring, Slack identity, Turso production DB, E2E tests, MSW alignment, and repo hygiene
- `design.md` — Integration architecture, 12 correctness properties, auth helper design, cookie scoping, notification sink pattern
- `tasks.md` — 21 task groups, 49 leaf tasks — **all completed**

---

## Auth Architecture (Post-Integration-Hardening)

- **Cookie-based sessions**: Magic link verification and session-link validation set `session` httpOnly cookie
- **`getAuthContext`**: Factory function (`createGetAuthContext`) extracts + validates session cookie against UserSessionRepository
- **`withAuth`**: Factory-created HOF wrapper that enforces auth on route handlers (401 if invalid)
- **`authorizeTeamMember`**: Factory function verifying member belongs to requested team (403 if not)
- **`authorizeDeliveryManager`**: Extends team membership check with delivery_manager role requirement
- **All `/api/me/*`, `/api/teams/*`, `/api/responses` routes**: Protected via cookie auth
- **Slack identity**: Persistent DB-backed SlackIdentityLink records (replaces in-memory Map)
- **Notification wiring**: Scheduler tick → NotificationService → ProductionNotificationSink → Slack API
- **Turso**: Environment-aware Prisma client (better-sqlite3 locally, @libsql/client in production)

---

## Hooks

- `requirement-traceability` (postTaskExecution) — reminds agent to tag Requirement IDs in source files and commit messages after each task

---

## Outstanding Work

- Design system / component library (currently ad-hoc Tailwind)
- Dark mode support
- Responsive navigation / shared layout
- CSRF protection on form submissions
- Rate limiting on non-auth endpoints
- Session revocation UI
- Load/performance testing
- End-to-end Slack integration test (against real workspace)
