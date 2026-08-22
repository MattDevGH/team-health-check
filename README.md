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

Integration hardening is currently on `feat/integration-hardening`, pending
full automated validation, real browser and Slack acceptance validation, and a
pull request. Keep it on the feature branch until that validation is complete;
do not merge or push it directly to `master`.

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

### 4. Configure Event Subscriptions

1. Under **Event Subscriptions**, toggle events **On**
2. Set the Request URL to: `https://your-domain.com/api/slack/events`
   - Slack will send a verification challenge — the app handles it automatically
   - For local development, use a tunnel like [ngrok](https://ngrok.com): `ngrok http 3000`
3. Under **Subscribe to bot events**, add:
   - `app_mention` — respond when the bot is @mentioned
   - `message.im` — handle direct messages to the bot

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

### 7. Link Team Members

Once the Slack app is installed, team members link their accounts:

1. In Slack, type `/healthcheck connect` — the bot responds with a 6-digit pairing code
2. Enter the code in the web interface (Profile → Slack section) within 10 minutes
3. Once linked, the member receives health check prompts via Slack DM

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

- **Cookie-based auth** — `withAuth` / `getAuthContext` validates session cookies against UserSession table
- **Team authorization** — `authorizeTeamMember` / `authorizeDeliveryManager` enforce access control
- **Repository pattern** for testability — services depend on interfaces, not Prisma directly
- **Factory injection** — services created via factory functions accepting dependencies
- **Thin route handlers** — validate input (Zod), enforce auth, call service, format response
- **Typed errors** — all errors extend `AppError`, mapped to HTTP status codes automatically
- **Environment-aware DB** — Turso (libSQL) in production, better-sqlite3 locally

## Testing

TDD approach using Vitest, React Testing Library, msw, jest-axe, fast-check, and Playwright.

```bash
npm test            # unit + property tests (922 tests across 111 files)
npm run test:watch  # watch mode for TDD (unit only)
npx playwright test # e2e browser tests (happy-path + accessibility)
```

| Layer | Purpose |
|-------|---------|
| Unit tests | Service logic with in-memory repository fakes |
| Property tests | 12 formal correctness invariants (fast-check, 100 iterations each) |
| Integration tests | Full flows against real SQLite |
| Accessibility tests | WCAG 2.1 AA compliance (jest-axe + Playwright axe-core) |
| E2E tests | Browser user flows — happy path, cookie persistence, accessibility |

## CI/CD

GitHub Actions pipeline with two jobs:

1. **`ci`** — Install → Lint → Type Check → Unit+Property Tests (922 tests) → Build
2. **`e2e`** — Install → Build → Playwright E2E Tests (depends on `ci` passing)

A **requirement coverage** check also runs on PRs to verify requirement IDs are referenced.

All stages must pass before merge to master.

## Working with AI assistants

- **`AGENTS.md`** — rules and architecture constraints for AI agents
- **`AI_CONTEXT.md`** — current project state. Read at session start, update with every commit.

## Spec

Feature specifications at `.kiro/specs/`:

**`team-health-check/`** — Original feature spec:
- Requirements (20 functional + 4 non-functional)
- Technical design (architecture, data models, 34 correctness properties)
- Task list (28 groups, ~120 sub-tasks)

**`integration-hardening/`** — Integration wiring spec (completed):
- Requirements (13 covering auth, notification wiring, Turso, E2E)
- Technical design (12 correctness properties, auth helper patterns)
- Task list (21 groups, 49 leaf tasks — all implemented)

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

- **No end-to-end Slack test** — Slack integration is unit-tested (signature verification, payload parsing, retry logic, identity resolution) but never tested against a real Slack workspace.
- **No load/performance testing** — SQLite/Turso is fine for small teams but untested under concurrent access patterns.
