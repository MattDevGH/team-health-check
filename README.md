# Team Health Check

> A lightweight feedback tool for delivery teams, inspired by the Spotify Squad Health Check Model.

Collects regular health-check responses from team members via a mobile-friendly web interface and Slack bot, then visualises trends over time to help delivery managers identify patterns and improvements.

## Stack

- **Next.js 16** — React framework with App Router and API routes
- **TypeScript** — strict mode, no `any` types
- **Prisma 7** — ORM with SQLite via `better-sqlite3` (driver adapter pattern)
- **Tailwind CSS v4** — utility-first styling
- **Zod** — runtime input validation
- **SQLite** — single-file database, no server required

## Getting Started

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development and Branching Workflow

`master` is the stable/default branch. Create feature work on
`feat/<feature-name>` branches, then merge through a pull request only after CI
and relevant acceptance validation pass.

Commits follow one green, testable vertical slice: write the failing test, make
the minimal implementation pass, update README/AI context when behavior,
structure, coverage, or conventions change, validate, and commit before starting
the next slice. A small handful of focused files and usually fewer than 200–300
changed lines is a reviewability guideline, not a quota. The current browser
acceptance checkpoint is an explicitly approved one-off consolidation exception;
one-behavior cadence resumes with Task 23.

Integration hardening remains open on `feat/integration-hardening`; do not
start the lifecycle-management milestone or merge directly to `master` yet.
Manual browser acceptance through two complete health-check sessions has passed,
including validated/audited settings persistence, editable feedback,
authenticated close, materialisation, closed-link enforcement, and two-session
dashboard data. The accepted fixes are preserved in the approved one-off
consolidation checkpoint.

A 2026-08-23 closure audit corrected the earlier “all implemented” status. The
remaining merge blockers are tracked as Tasks 23–26 in
`.kiro/specs/integration-hardening/tasks.md`:

1. **Auth/session and audit contracts:** micro-pulse selection, reused-session
   close scoping, and the still-missing schedule-change and member-addition audit
   emissions.
2. **Slack production behavior:** secure pairing and real unlink, actionable
   command flow, cadence/delivery-window eligibility, closing reminders,
   persistent retry processing, and disposable-workspace acceptance.
3. **Automated evidence:** isolated/seeded E2E data, secure test-email capture,
   non-skipping browser-first Playwright flows, broader axe coverage, corrected
   MSW identity contracts, executable local libSQL repository evidence, and CI
   skip/isolation enforcement.
4. **Final closure:** synchronize requirements/design/tasks/docs, run all local
   and remote gates, commit/push the accepted work, and merge through a green PR.

Session lifecycle management and the dashboard UX observations are explicitly
deferred follow-up milestones, not integration-hardening merge blockers. The
branch stays open until the closure tasks, real Slack evidence, non-skipping
Playwright suite, build, CI, and documentation are all complete.

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

See `.env.example` for all available variables with descriptions. None are required for running tests — they're only needed when connecting to real Slack/email services.

```env
# Minimum for Slack integration:
SLACK_SIGNING_SECRET="your_slack_signing_secret"
SLACK_BOT_TOKEN="xoxb-your-bot-token"
NEXT_PUBLIC_APP_URL="https://your-domain.com"

# For magic link emails:
RESEND_API_KEY="re_your_api_key"
EMAIL_SENDER="Team Health Check <noreply@yourdomain.com>"

# For scheduled session automation:
CRON_SECRET="a_random_secret_string"
```

## Slack Integration Setup

Follow these steps to connect the app to your Slack workspace.

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, give it a name (e.g. "Team Health Check"), and select your workspace
3. Note the **Signing Secret** from the Basic Information page — set it as `SLACK_SIGNING_SECRET` in your `.env`

### 2. Configure Bot Permissions

Under **OAuth & Permissions**, add these Bot Token Scopes:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send health check prompts and confirmations to members |
| `commands` | Handle the `/healthcheck` slash command |
| `im:write` | Open DM conversations with team members |
| `users:read` | Resolve Slack user display info |

### 3. Install to Workspace

1. Click **Install to Workspace** and authorise the app
2. Copy the **Bot User OAuth Token** (`xoxb-...`) — set it as `SLACK_BOT_TOKEN` in your `.env`

### 4. Configure the Events Endpoint

1. Under **Event Subscriptions**, toggle events **On**
2. Set the Request URL to: `https://your-domain.com/api/slack/events`
   - Slack's verification challenge is implemented
   - For local development, use an HTTPS tunnel such as `ngrok http 3000`

The current integration does **not** implement conversational behavior for
`app_mention` or `message.im`; those callbacks are acknowledged only. Do not add
those subscriptions as a functional setup requirement unless that deferred Slack
enhancement is implemented.

### 5. Configure Interactivity

1. Under **Interactivity & Shortcuts**, toggle **On**
2. Set the Request URL to: `https://your-domain.com/api/slack/interactions`
   - This receives button clicks (score submissions) from health check prompts

### 6. Register Slash Commands

1. Under **Slash Commands**, click **Create New Command**
2. Create the `/healthcheck` command:
   - **Command**: `/healthcheck`
   - **Request URL**: `https://your-domain.com/api/slack/commands`
   - **Short Description**: "Respond to the current health check"
   - **Usage Hint**: `[connect]`

### 7. Account Linking — Integration Closure Status

`/healthcheck connect` generates a short-lived pairing code and the database
identity repository is implemented. The full user flow is **not yet
production-ready**: authenticated web code entry is missing, the current pairing
route accepts a caller-supplied member ID, and unlink currently reports success
without deleting the persisted link. Integration-hardening Task 24.1 must close
these gaps before real-workspace acceptance or deployment.

The intended accepted flow is:

1. The member runs `/healthcheck connect` and receives an ephemeral code
2. The authenticated member enters the code in the web profile
3. The link survives reload/restart and Slack prompts route to that member
4. Unlink deletes the persisted mapping before the UI reports success

### 8. Schedule Health Checks (Optional)

The app supports automatic session scheduling via a cron job that hits the scheduler endpoint:

```bash
# Example: trigger every minute (the scheduler only acts at configured open/close times)
curl -X POST https://your-domain.com/api/scheduler/tick \
  -H "Authorization: Bearer $CRON_SECRET"
```

For production, use a cron service (e.g. GitHub Actions, AWS EventBridge, Vercel Cron) to call this endpoint at regular intervals (every 1–5 minutes). The scheduler checks team schedules and opens/closes sessions at the configured times.

### Local Development with Slack

For testing Slack locally:

1. Install [ngrok](https://ngrok.com): `npm install -g ngrok`
2. Start the app: `npm run dev`
3. Start the tunnel: `ngrok http 3000`
4. Use the ngrok HTTPS URL as the base for all Slack endpoint configurations
5. Remember to update the Slack app URLs when your ngrok session changes

## Email Setup (Resend)

The app sends magic link emails via [Resend](https://resend.com) — a developer-friendly email API. Magic links are how users authenticate and create new teams.

### 1. Create a Resend Account

1. Sign up at [resend.com](https://resend.com) (free tier includes 100 emails/day)
2. Go to **API Keys** and create a new key
3. Set the key as `RESEND_API_KEY` in your `.env`

### 2. Configure a Sender Address

Resend requires a verified sender domain or you can use their testing address:

- **For development/testing**: use `onboarding@resend.dev` as `EMAIL_SENDER` — this works immediately without domain verification, but emails can only be sent to the email address you signed up with
- **For production**: add and verify your own domain under **Domains** in the Resend dashboard, then use an address on that domain (e.g. `noreply@yourdomain.com`)

```env
# Development (sends only to your own email):
EMAIL_SENDER="onboarding@resend.dev"

# Production (sends to anyone, requires verified domain):
EMAIL_SENDER="Team Health Check <noreply@yourdomain.com>"
```

### 3. Set your App URL

Magic link emails contain a clickable link back to the app. Set `NEXT_PUBLIC_APP_URL` to the URL where your app is accessible:

```env
# Local development:
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Production:
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

The email will contain a link like `https://your-domain.com/auth/magic/{token}` that authenticates the user when clicked.

## Production Database (Turso)

The app uses a local SQLite file (`prisma/dev.db`) for development and [Turso](https://turso.tech) (libSQL over HTTP) for production on Vercel. The Prisma schema stays as `sqlite` provider — Turso is fully SQLite-compatible, so no schema changes are needed.

**Local development requires no Turso configuration.** The app automatically uses `better-sqlite3` when `TURSO_DATABASE_URL` is not set.

### 1. Create a Turso Database

```bash
# Install the Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign up / log in
turso auth signup   # or: turso auth login

# Create the database
turso db create team-health-check
```

### 2. Get Connection Credentials

```bash
# Database URL (libsql:// protocol)
turso db show team-health-check --url

# Auth token
turso db tokens create team-health-check
```

### 3. Configure Environment Variables

Set these in your production environment (Vercel dashboard or CLI):

```env
TURSO_DATABASE_URL="libsql://your-database-name-your-org.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"
```

### 4. Vercel Deployment

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for the **Production** (and optionally Preview) environments
3. Deploy — the app detects `TURSO_DATABASE_URL` at runtime and switches to the libSQL adapter automatically

> **Note:** Push your schema to Turso before the first deploy:
> ```bash
> turso db shell team-health-check < prisma/migrations/20260620233208_init/migration.sql
> ```

## Architecture

```
Browser → Route Handler → Auth (cookie validation) → Service → Repository → Prisma → SQLite/Turso
```

- **Cookie-based auth** — `withAuth` / `getAuthContext` validates session cookies against UserSession; `AuthContext.memberId` is the sole protected-browser identity and caller identity headers are ignored
- **Intentional auth exemptions** — magic-link tokens, session-link tokens, genesis tokens, verified Slack signatures, and scheduler `CRON_SECRET` entry points validate their own credential instead of browser cookies
- **Persisted logout** — `POST /api/auth/logout` revokes the presented UserSession token and clears the httpOnly cookie, including stale/expired client state
- **Authenticated team collection** — `/api/teams` GET returns only the cookie member's team; POST derives creator/member/role/audit identity from AuthContext and atomically rejects concurrent or sequential attempts to create a second team
- **Authorized team exports** — `/api/teams/[teamId]/export` authenticates from the session cookie and returns aggregate CSV data only when the member belongs to the requested team
- **Protected session details** — session-detail GET permits ordinary members of the requested team and returns the same 404 for missing or cross-team sessions
- **Protected participation** — participation GET derives identity only from the session cookie, binds the session to the URL team, and preserves privacy-aware counts without exposing response details
- **Team authorization** — `authorizeTeamMember` / `authorizeDeliveryManager` enforce access control
- **Repository pattern** for testability — services depend on interfaces, not Prisma directly
- **Factory injection** — services created via factory functions accepting dependencies
- **Thin route handlers** — validate input (Zod), enforce auth, call service, format response
- **Stable member summaries** — TeamService composes roles and optional Slack identity links through injected repositories
- **Typed errors** — all errors extend `AppError`, mapped to HTTP status codes automatically
- **Environment-aware DB** — Turso (libSQL) in production, better-sqlite3 locally

## Testing

TDD approach using Vitest, React Testing Library, msw, jest-axe, fast-check, and Playwright.

```bash
npm test            # unit + property tests (1013 tests across 123 Vitest files)
npm run test:watch  # watch mode for TDD (unit only)
npm run test:e2e    # Playwright browser tests
npm run test:a11y   # Playwright axe tests
```

| Layer | Purpose |
|-------|---------|
| Unit tests | Service logic with in-memory repository fakes |
| Property tests | 12 formal correctness invariants (fast-check) |
| Integration tests | Focused service/route flows; closure work adds executable libSQL repository evidence |
| Accessibility tests | WCAG checks through jest-axe and Playwright axe-core |
| E2E tests | Browser user flows; required happy paths are currently non-credible because missing test-token capture can skip them |

Manual browser acceptance has passed for team settings, editable feedback,
optional trend clearing, two complete session lifecycles, close/materialisation,
closed links, and the one-to-two-session dashboard transition. This evidence does
not replace integration Requirement 10: Playwright must use isolated seeded
data, a secure test email interceptor, browser-managed cookies, and required
non-skipping assertions before merge.

The focused genesis regression suite covers non-mutating pending-token
verification, the single CAS claim during genesis, one-success/second-conflict
behavior, submitted team details, route validation plus session cookie creation,
and safe rendering of structured or malformed API errors.

## CI/CD

GitHub Actions defines three PR gates:

1. **`ci`** — Install → Prisma generate/schema push → Lint → Type Check → Vitest → Build
2. **`e2e`** — Install → Prisma setup → Build → Chromium install → Playwright, after `ci`
3. **`requirement-coverage`** — Require requirement references in the PR body

The closure audit found that `DATABASE_URL=file:./test.db` is not yet honored by
all Prisma runtime/config paths and the E2E job does not seed canonical
questions. The current happy paths can call `test.skip` when a nonexistent token
capture endpoint is unavailable. A green job is therefore not sufficient until
Tasks 25.1, 25.2, and 25.6 make isolation, seeding, and zero required skips
enforceable.

All three jobs and the uploaded Playwright evidence must pass before merge to
`master`.

## Working with AI assistants

- **`AGENTS.md`** — rules and architecture constraints for AI agents
- **`AI_CONTEXT.md`** — current project state. Read at session start, update with every commit.

## Spec

Feature specifications at `.kiro/specs/`:

**`team-health-check/`** — Original feature spec:
- Requirements (20 functional + 4 non-functional)
- Technical design (architecture, data models, 34 correctness properties)
- Task list (28 groups, ~120 sub-tasks)

**`integration-hardening/`** — Integration wiring spec (**open**):
- Requirements (13 covering auth, notification wiring, Turso, E2E, and contracts)
- Technical design (12 correctness properties and integration patterns)
- Tasks 1–21 record the original implementation pass; Task 22 records completed browser regressions
- Tasks 23–26 are the authoritative closure plan for auth/session, Slack, automated evidence, documentation, CI, and PR completion

## Known Issues & Future Work

### Design & UI

- **No design system** — components use ad-hoc Tailwind classes. A consistent design language (spacing scale, colour palette, component library) would improve cohesion. Consider adopting something like shadcn/ui or Radix primitives.
- **Dark mode not supported** — the CSS has custom property scaffolding ready for it, but pages use hardcoded light-mode Tailwind classes (`bg-gray-50`, `text-gray-800`, etc.). Dark mode would need a proper theme toggle and a pass across all pages.
- **No responsive navigation** — there's no shared layout, nav bar, or sidebar. Each page is standalone. A logged-in user has no way to navigate between dashboard, settings, and profile without knowing the URLs.

### Accessibility

- **Colour contrast partially addressed** — global input/placeholder contrast fixed, Playwright axe tests added. But individual pages haven't all been audited in a real browser with axe DevTools.
- **No skip-to-content links** — keyboard users can't bypass repeated navigation (once navigation exists).
- **No focus management on route transitions** — screen readers aren't notified when the page changes.
- **No reduced-motion support** — no `prefers-reduced-motion` media query handling.

### Security

- **No CSRF protection** on form submissions (session links are one-time-use tokens which helps, but dashboard forms aren't protected).
- **No rate limiting on non-auth endpoints** — the API has rate limiting on magic link requests and session-link validation, but other endpoints are unprotected.
- **Slack bot token stored in env only** — no secrets manager integration.

### Testing gaps

- **Playwright closure is incomplete** — required happy paths can skip, use stale
  contracts/manual cookies, and share non-isolated unseeded data. Tasks 25.1–25.3
  replace them with deterministic browser-first and accessibility evidence.
- **No real-workspace Slack acceptance** — low-level behavior is automated, but
  account linking/unlink, prompts, interactions, reminders, and durable retry
  still need implementation closure plus a disposable-workspace pass.
- **No executable libSQL repository proof** — client selection exists, but Task
  25.5 must execute representative repository behavior through the local libSQL
  adapter.
- **No load/performance testing** — explicitly deferred beyond integration
  hardening; SQLite/Turso remains untested under concurrent load.
