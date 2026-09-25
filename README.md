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
changed lines is a reviewability guideline, not a quota.

CI runs on pushes to any branch, so a feature branch is validated before review
rather than only once a pull request exists.

### Project status

**Live, and used against a real team's data.** The application supports the full
loop: magic-link, Slack and genesis sign-in; team and schedule configuration;
scheduled sessions; feedback through the web interface or Slack; close and
materialisation; and a trends dashboard — with a delivery manager able to run
all of it from the interface, without knowing URLs or calling the API.

Twelve specs live in `.kiro/specs/`, listed under **Spec** below. Eight are
closed; the open boxes in the rest are named there and are mostly things that
need a person rather than more code.

Integration hardening passed its final verification gate on 2026-08-26 — lint,
type check, 1193 Vitest tests, build, 27 Playwright tests with zero skips, and a
real Slack workspace pass. Its 2026-08-23 closure
audit is worth knowing about, because it shaped how this project treats
evidence: a set of tasks had been marked complete before the behaviour existed,
and re-verification found that several "done" features did not work. Among the
defects that a fully green test suite did not catch:

- the Turso production database path would have failed on its first query
- the runtime ignored `DATABASE_URL`, so test runs wrote to the development database
- closing reminders were indistinguishable from opening prompts
- the Slack retry queue was discarded at the end of every request
- four pages carried WCAG AA contrast failures

The lesson is recorded as Testing Rules in `AGENTS.md`: assert observable
outcomes rather than the calls you just made, and run the real thing before
claiming it works.

**It keeps being the right lesson.** Every milestone since has found something
in the same way — by a person using the application, not by adding assertions to
a green suite. The most recent, on 2026-09-18, found three defects in one
sitting while 2,180 tests passed. One of those tests was specifically about the
defect it failed to see.

### Manager experience — complete 2026-08-30

`.kiro/specs/manager-experience/` closed the gap between "the system works" and
"a delivery manager can run it unaided". Delivered across five pull requests:

- **Shared navigation** — a skip link, Dashboard, Settings, Profile, Audit log
  for delivery managers, and the product's first sign-out control. Mounted by
  the authenticated segments' layouts, so unauthenticated pages cannot render it.
- **Session lifecycle** — open a health check in one click, close it behind a
  confirmation. Previously possible only through the API or by waiting for the
  scheduler.
- **Dashboard comprehension** — the trend chart gained a caption, a legend and a
  real data table; Latest Session shows what people said rather than only how
  many answered; question rows announce that they expand; `1 responses` is gone.
- **First-run guidance** — a new team is told what to do next, on the page that
  does it.
- **Ambiguous-identity guard** — see the limitation below.

Three defects were found by *using* the app rather than by testing it, and
fixed outside the plan: a magic link was claimed twice, reporting a successful
sign-in as expired; the Audit Log page crashed because its route returned a
bare array while the page expected an envelope — each side tested, each side
green, no test crossing between them; and **signing in landed nowhere**.

That last one is worth reading twice. Magic-link verification and genesis both
redirect to `/`, which was a static marketing page whose primary action was
"Sign in with magic link" — so a successful sign-in delivered the member to an
invitation to sign in, and the only way onward was to already know a URL. The
end-to-end suite asserted the landing URL was `/` and called that a pass, then
read the team id out of the database and navigated directly. It navigated by
URLs it looked up, so it never asked the question a person asks: *can I get in
from here?* `/` now sends a signed-in visitor to their dashboard.

A fourth was raised in the same way on 2026-09-11: a health check that closed
with nobody answering left no trace on the chart, so its lines stopped and
resumed with nothing to say why. A dashed vertical line now marks the date.

### Known limitation: one team per person

**A person can belong to only one team.** Colleagues sharing this tool should
each run their own.

The schema permits the same email in several teams — `TeamMember` is unique on
`(teamId, name, email)`, and an integration test against a real database
confirms it — but sign-in has to resolve an email to a single member. Two
guards enforce the constraint the schema does not:

- **Adding a member** whose email already belongs to another team is rejected
  with a 409 before anything is written, so the manager doing the adding finds
  out immediately.
- **Requesting a magic link** for an email held by more than one member issues
  nothing and logs the collision. The HTTP response is unchanged, so the
  anti-enumeration property is preserved.

Members without an email address are unaffected: the ambiguity is about
sign-in, and they cannot sign in.

**Resolving a conflict that predates the guard:** find the duplicate rows with
`SELECT id, teamId, name FROM TeamMember WHERE email = '…'`, then either remove
the member from the team they no longer belong to, or give one of them a
different email. The server log names the email and the team ids whenever a
sign-in is refused for this reason.

Full multi-team membership needs an identity model above `TeamMember`, a team
switcher, and a review of every team-scoped query. It is a separate future spec.

### Dashboard refinement — complete 2026-09-01

`.kiro/specs/dashboard-refinement/` came entirely from one manual pass over the
live application against real team data. None of it was found by a test, and
none of it failed one.

- **Three defects** — a profile field the API never sent, raw member ids in the
  audit log, and a question theme nobody answered vanishing rather than being
  reported.
- **A chart that tells the truth about time** — sessions are spaced by when they
  closed, so a slope reflects how quickly a score moved.
- **Series told apart without colour** — a dash pattern and a marker shape as
  well as a hue, with the legend swatch repeating both.
- **Question themes, and the question behind them** — the sentence a member is
  actually asked has been in the database since the first migration and was
  displayed nowhere.
- **Settings that explain themselves** — including what happens if you change
  nothing.
- **A filterable chart** — focus on one theme at a time, without ever removing
  a value from the page.

### Reaching your health check — 2026-09-19

`.kiro/specs/reaching-your-health-check/` exists because of a single morning in
production. On 2026-09-14 a check opened on schedule and **nobody could answer
it**. Nothing in the signed-in application linked to a session, and the only
way anyone had ever reached one was a link in a Slack message — so a deployment
without Slack opened checks on schedule and told nobody they existed.

Four phases, four pull requests.

- **A member can reach their own check.** The dashboard offers a route while a
  check is collecting, and `/me/health-check` resolves the signed-in member's
  own link from anywhere in the application. It is a link rather than a
  redirect: landing straight in a form having clicked "Health check" gives no
  moment to see what is about to be asked, and no way back without the browser
  button.
- **Email can carry a prompt.** `sendHealthCheckPrompt` is a second method
  rather than a flag on the first, so the prompt and the sign-in link cannot
  drift into being the same template. Each channel is attempted independently:
  a Resend outage that stopped Slack prompts would be worse than having no
  email at all.
- **The member chooses.** An **Email prompts** switch on the profile page,
  defaulting to whatever suits how they are set up — email for a member with no
  Slack link, Slack alone for a member with one. The stored field is nullable
  on purpose: null means *has not chosen*, and a stored default would have to be
  picked before anybody knew whether Slack would be linked.
- **Proved.** A contributor, not a Delivery Manager, walked both routes in a
  browser; then the same was done against the deployed application, with the
  answers read back out of Turso rather than trusted from the confirmation.

**Both proofs found defects the suite could not.** Writing the contributor
browser test found that the dashboard withheld its whole panel — and so the
"answer" link inside it — from anybody who could not manage a check. The
production pass found three more: a confirmation rendered above a five-question
form and therefore off the top of the screen, a second save that looked exactly
like nothing happening, and two buttons in a row both reading "Answer the health
check".

The second of those is worth repeating. A test named *"reports a real change as
saved rather than as nothing"* was green, because it asserted the message did
**not** say "no changes" — true of a message box that had not changed at all.
Asserting an absence is satisfied by a stale screen.

One box stays open, and it needs a domain rather than code: confirming an email
prompt arrives from a verified sender, carries a working link, and is not
mistaken for a sign-in email. Until then Slack is the only prompt channel that
has been proved end to end in production.

### Milestones since deployment

**Deployment** — Vercel, Turso in Dublin, and an external cron trigger.
Specced in `.kiro/specs/deployment/`. It was expected to be configuration
rather than code, because the production database path already had execution
coverage. Two assumptions turned out to be false and cost real work:

- **Vercel's Hobby plan cannot run this scheduler.** Its cron jobs run once a
  day, and a finer expression fails at deployment. The tick is triggered
  externally instead.
- **`prisma migrate deploy` cannot reach Turso** — and worse, it would have
  migrated a local file and exited zero. The CLI now refuses, and
  `scripts/migrate-production.ts` applies migrations and seeds the catalogue.

Three startup guards were added so a wrong configuration cannot be held
quietly: no database in production, the CLI aimed at production, and `TEST_MODE`
in a deployment. Configuration reference: `docs/deployment.md`.

Since then, and each in its own spec:

- **`feeling-responsive/`** — the application was slow for months and nothing in
  the suite noticed. Query, request and layout-shift budgets are ratchets now,
  set at what the code does today.
- **`explaining-itself/`** — four profile controls that never said what they
  affected, and an answering form that ended in a receipt with nowhere to go.
  Closed 2026-09-20, after three production passes found seven defects between
  them that no test had.
- **`knowing-what-happened/`** and **`remembering-what-happened/`** — the
  scheduler tick returned `200` and nothing else, so "why did no check open on
  Monday?" could only be answered by reasoning about code that had already run.
  It now says what it did in a sentence, and keeps a 90-day ledger.
- **`slack-sign-in/`** — proved in a real workspace on 2026-09-17. It is what
  lets a team trial the tool without owning a domain, which is otherwise
  required for email to reach anybody but the Resend account owner.
- **`reaching-your-health-check/`** — above.

### What is next

**One fix is in flight** (2026-09-25): `slack-sign-in` phase 6, closing a
fail-open in Slack signature verification that an external review of the
repository found. The signing secret was read as
`process.env.SLACK_SIGNING_SECRET ?? ''`, so a deployment without it computed
every HMAC from an empty key — which anybody can reproduce, making a forged
request verify. Production was checked before anything changed and was never
exposed.

Besides that, **six boxes are open across twelve specs**, every one of them
waiting on something outside the code:

| Blocked on | Boxes |
|---|---|
| A verified Resend sending domain | 3 in `deployment`, 1 in `reaching-your-health-check` |
| A second account in the Slack workspace | 2 in `slack-sign-in` |

The domain is the one that matters. Until an email reaches somebody who is not
the Resend account owner, email is an untested prompt channel rather than a
proved one — and that is the failure this project has already been bitten by,
silently.

The Slack pair cannot be closed from inside a one-person workspace at all: every
account there matches a member, so the path where somebody is *not* recognised
never runs.

One dependency upgrade is also parked, and it is blocked upstream rather than
undone: ESLint 10 cannot be adopted while `eslint-config-next` depends on
`eslint-plugin-react`, whose latest release declares `eslint: ^3 || … || ^9.7`
and calls a method ESLint 10 removed.

### Later milestones (not started)
- **Delivery-manager user guide** in `docs/`, once in-app guidance exists.
- **Slack Socket Mode:** evaluate as a development-only convenience to remove
  the tunnel requirement, keeping HTTP endpoints for production.
- **Broader work:** design system, dark mode, CSRF, generalised rate limiting,
  load testing, telemetry.

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

## How a member hears a check has opened

There are two prompt channels, and they are not the same as the two ways in.
Signing in is covered under Email Setup and Slack Integration Setup below; this
is about the message that says there is something to answer.

| Channel | Needs | Reaches |
|---|---|---|
| Slack | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and the member's Slack account linked | Members with a Slack link |
| Email | `RESEND_API_KEY`, `EMAIL_SENDER`, a verified sending domain, and an address on the member | Members with an address |

**Until 2026-09-18, Slack was the only prompt channel.** The scheduler called
`sendSlackPrompt` and nothing else, so a deployment without Slack opened checks
on schedule and told nobody they existed. That is not a gap in configuration
advice — it is what the `reaching-your-health-check` spec was written to fix,
and it was found in production.

**With neither configured**, checks still open and close on schedule and can
still be answered: signed-in members reach the current check from the dashboard
or from Health check in the navigation. Nothing arrives to tell them to.

**With Slack only**, linked members are prompted in Slack. A member with no
Slack link hears nothing, which is the situation above for them individually.

**With email only**, every member with an address is prompted by email.

**With both**, each member gets whichever channels they are eligible for, and
one failing does not stop the other. A member who has chosen nothing gets Slack
alone if they have a link and email if they do not — so nobody is left with no
channel, and nobody already living in Slack is told twice.

A member can override that on their profile page with **Email prompts**. It
governs prompts only: sign-in links arrive by email whatever it says, and it is
separate from **Reminders**, which decides *which* messages are sent rather than
*how* they arrive. Turning it off with no Slack link is allowed and leaves that
member with no prompt channel at all — they can still reach the check from the
application.

One known hole, on the roadmap rather than built: a Slack-linked member who has
chosen nothing hears nothing if Slack delivery fails, because email defaults off
for them. Closing it needs the retry queue to report outcomes.

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
| `chat:write` | Send health check prompts and reminders — `chat.postMessage` is the only Slack Web API call the app makes |
| `commands` | Handle the `/healthcheck` slash command |
| `im:write` | Open the DM conversation when posting to a user ID |
| `users:read`, `users:read.email` | Read a member's verified email on `/healthcheck signin`, so somebody nobody has set up can be matched to their team — the only call to `users.info` |

**The last two are optional.** `users:read` was listed here once and then
removed, because nothing called `users.info` and the Task 24.5 acceptance pass
ran without it. That reasoning was about it being *unused*, not unwanted, and
Slack sign-in is the thing that uses it.

Without them, everything still works: a delivery manager records each member's
Slack ID in team settings and those members sign in normally. With them, a
member nobody has set up can run `/healthcheck signin` and be matched by the
address Slack has already verified. A workspace that has not granted the scopes
falls back to the manual path rather than failing — and the refusal is recorded
as `slack.email.unavailable` with Slack's own error, so `missing_scope` is
visible in the log rather than inferred from members who cannot sign in.

A matching email never *creates* a member. Being in the workspace is not being
on a team.

### 3. Install to Workspace

1. Click **Install to Workspace** and authorise the app
2. Copy the **Bot User OAuth Token** (`xoxb-...`) — set it as `SLACK_BOT_TOKEN` in your `.env`

### 4. Configure the Events Endpoint — *optional, and currently unnecessary*

Nothing in the application subscribes to a Slack event. `/api/slack/events`
answers the URL-verification challenge and acknowledges every callback without
acting on it, so **you can skip this section entirely** and everything works:
prompts, buttons, `/healthcheck`, and sign-in.

If you want the endpoint registered anyway, for when conversational behaviour
arrives:

1. Under **Event Subscriptions**, toggle events **On**
2. Set the Request URL to: `https://your-domain.com/api/slack/events`
   - Slack's verification challenge is implemented
   - For local development, use an HTTPS tunnel such as `ngrok http 3000`

Do **not** subscribe to `app_mention` or `message.im`. Those callbacks are
acknowledged and dropped, so subscribing advertises a behaviour the app does not
have.

### 5. Configure Interactivity

1. Under **Interactivity & Shortcuts**, toggle **On**
2. Set the Request URL to: `https://your-domain.com/api/slack/interactions`
   - This receives button clicks (score submissions) from health check prompts
   - A click is answered through Slack's `response_url`: a confirmation naming the
     question and score, a validation error for an out-of-range score, or a
     session-ended message if nothing is open. The prompt and its buttons stay in
     place so answers can still be changed until the session closes

### 6. Register Slash Commands

1. Under **Slash Commands**, click **Create New Command**
2. Create the `/healthcheck` command:
   - **Command**: `/healthcheck`
   - **Request URL**: `https://your-domain.com/api/slack/commands`
   - **Short Description**: "Respond to the current health check"
   - **Usage Hint**: `[connect|signin]`

One command, three behaviours:

| What somebody types | What happens |
|---|---|
| `/healthcheck` | The open check's questions, as buttons |
| `/healthcheck connect` | A pairing code, to link their account from the web profile |
| `/healthcheck signin` | A single-use sign-in link, so they never need the email |

### 7. Account Linking — Integration Closure Status

Account linking is implemented end to end (integration-hardening Task 24.1):

1. The member runs `/healthcheck connect` and receives an ephemeral code
2. The authenticated member enters the code in the web profile — the pairing
   route derives the member from the session cookie, never from the request body
3. The link is persisted, survives reload/restart, and Slack prompts route to
   that member
4. Unlink deletes the persisted mapping before the UI reports success

Verified against a real Slack workspace on 2026-08-26 (Task 24.5), including that
unlink deletes the persisted row rather than only reporting success.

### 7a. On-demand `/healthcheck`

A bare `/healthcheck` returns the member's outstanding questions for the current
open session as interactive score buttons, plus their session link as a browser
fallback. Weekly members are prompted with every outstanding question;
micro-pulse members receive the weighted subset chosen by the question selection
service. Unlinked users get pairing instructions, teams with no open session get
an informative message, and a member who has answered everything is told so and
linked to their responses.

An explicit `/healthcheck` is never refused because the member is marked away,
has reminders disabled, or is outside the team's Slack delivery window — those
gates apply to bot-initiated prompts. An away member is prompted with an
advisory note.

Bot-initiated prompts are gated by `NotificationService`: a member is prompted
only when they have a Slack link, are not marked away, and the team's configured
delivery window is open in the team's timezone (boundaries inclusive, windows may
span midnight, and an unconfigured window imposes no restriction). The per-member
Reminders toggle governs closing reminders and nudges, not opening prompts, so
opting out of reminders never removes a member from the health check.

The profile page says all of this beside the controls themselves, tied to each
with `aria-describedby` — what weekly and micro-pulse actually ask for, which
notifications the Reminders toggle governs and which it does not, and that being
away stops prompts without closing anything: a check already open stays
answerable, because availability gates notifications and nothing else.

An away period can be seen with its dates and cancelled, which it could not be
before — the page took two dates, said "saved" and forgot them. Cancelling is
scoped to the member: a period belonging to somebody else returns exactly what
an invented id returns, so nothing says whether the id named anything.

### 8. Schedule Health Checks (Optional)

The app supports automatic session scheduling via a cron job that hits the scheduler endpoint:

```bash
# Example: trigger every minute (the scheduler only acts at configured open/close times)
curl -X POST https://your-domain.com/api/scheduler/tick \
  -H "Authorization: Bearer $CRON_SECRET"
```

For production, an **external** cron service calls this endpoint every few
minutes. The scheduler checks team schedules and opens or closes sessions at the
configured times.

**Not Vercel Cron on the Hobby plan.** Its cron jobs run once per day at ±59
minutes, and a more frequent expression fails at deployment rather than
degrading — which is no use to a scheduler that opens sessions at wall-clock
times, waits 30 seconds after a close to materialise, and backs off Slack
retries at 30s/2m/8m/20m. Vercel Pro lifts the limit to once per minute.

**Not GitHub Actions either**, on reflection: its scheduled runs can be dropped
under load, and scheduled workflows are disabled automatically after 60 days
without repository activity on a public repo — which bites hardest once the
project is finished and quietly relied upon.

The tick is idempotent and reconciles state, so a missed trigger costs a delay
rather than a lost session. See docs/deployment.md.

The cron service shows the response body of every call it makes, so the tick
answers in a sentence rather than in field names:

```json
{ "ok": true,
  "summary": "Ran, nothing was due: 2 teams outside the collection window, 1 team with no schedule configured.",
  "tickId": "p852iwt2", "opened": 0, "closed": 0, "materialised": 0,
  "prompts": 0, "durationMs": 118,
  "reasons": { "outside the collection window": 2, "no schedule configured": 1 } }
```

The counts are still there for anything that parses them. The sentence exists
because `"opened": 0` is the correct outcome on a Wednesday and a failure on
Monday at 15:30, and no count tells the two apart. See docs/operations.md.

**The response does not last.** cron-job.org keeps the last 50 executions —
counted in ticks, so between fifty minutes and four hours depending on the
interval — and Vercel's Hobby plan keeps the runtime logs for one hour. So every
tick also writes a **heartbeat**: one row in the application's own database,
replaced each time, carrying when it ran, what it did, and the same sentence and
tick id the response carried. It is written even when the tick did nothing,
because a quiet week and a stopped scheduler are otherwise identical, and no row
at all means the scheduler has never run. A failed heartbeat never fails the
tick.

### Local Development with Slack

For testing Slack locally:

1. Install [ngrok](https://ngrok.com): `npm install -g ngrok`
2. Start the app: `npm run dev`
3. Start the tunnel: `ngrok http 3000`
4. Use the ngrok HTTPS URL as the base for all Slack endpoint configurations
5. Set `NEXT_PUBLIC_APP_URL` to the same HTTPS URL and restart, so Slack messages
   carry publicly reachable session links rather than `localhost`
6. Remember to update the Slack app URLs when your ngrok session changes. A
   reserved ngrok domain avoids this entirely — the free tier includes one

**Pages hanging on "Loading" through the tunnel:** Next.js blocks cross-origin
requests to dev-only assets, so the page HTML serves fine over the tunnel host
while the client bundle is blocked, React never hydrates, and the page sits on
its loading state forever. The dev server log shows
`Blocked cross-origin request to Next.js dev resource`. `next.config.ts` sets
`allowedDevOrigins` for ngrok hosts to permit this. It is a development-only
setting with no effect on a production build.

**ngrok free tier interstitial:** human visitors see a warning page once per
browser before reaching the app. Slack's own POST requests are unaffected, so
endpoints work normally.

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

> **Apply the schema to Turso before the first deploy:**
>
> ```bash
> TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npx tsx scripts/migrate-production.ts
> ```
>
> This replaces piping one migration file through `turso db shell`, which this
> README recommended until 2026-09-12. That command applied only the **first**
> of three migrations and recorded nothing, so a database set up by following
> it would have been missing two schema changes with no way to tell.
>
> The script applies every migration not yet recorded, in order, then seeds the
> question catalogue. Both are safe to run again.
>
> `prisma migrate deploy` cannot reach Turso, and now refuses rather than
> migrating a local file and reporting success. See docs/deployment.md.

## Architecture

```
Browser → Route Handler → Auth (cookie validation) → Service → Repository → Prisma → SQLite/Turso
```

- **Cookie-based auth** — `withAuth` / `getAuthContext` validates session cookies against UserSession; `AuthContext.memberId` is the sole protected-browser identity and caller identity headers are ignored
- **Intentional auth exemptions** — magic-link tokens, session-link tokens, genesis tokens, verified Slack signatures, and scheduler `CRON_SECRET` entry points validate their own credential instead of browser cookies
- **Persisted logout** — `POST /api/auth/logout` revokes the presented UserSession token and clears the httpOnly cookie, including stale/expired client state
- **Authenticated team collection** — `/api/teams` GET returns only the cookie member's team; POST derives creator/member/role/audit identity from AuthContext and atomically rejects concurrent or sequential attempts to create a second team
- **Audited schedule configuration** — Delivery Manager changes emit stable complete `schedule_change` snapshots with the authenticated actor; normalized no-ops skip persistence/audit, while schedule, canonical team timezone, and audit append commit atomically
- **Audited member addition** — Delivery Manager additions return the same stable summary serialized into `member_added`; member, default role, and actor-bound audit commit atomically
- **Secure Slack linking** — pairing derives memberId from the session cookie (never the request body); a persisted, upserted `SlackIdentityLink` survives restarts and is returned by `GET /api/me`; unlink deletes the record before the UI reports success
- **On-demand Slack prompts** — `/healthcheck` resolves the linked member, their team's open session, and the outstanding questions for their cadence preference, reusing (or minting) the member's session link and returning interactive score blocks with a browser fallback
- **Gated bot prompts** — `NotificationService` sends scheduler-initiated prompts only to Slack-linked, available members inside the team's delivery window, evaluated in the team timezone
- **Answered interactions** — score button clicks reply through Slack's `response_url` with a confirmation, validation error, or session-ended message, without breaking the 3-second acknowledgement Slack requires
- **Closing reminders** — sessions store a DST-safe scheduled close when they open; the scheduler reminds eligible members inside the lead window (default 24h, set `CLOSING_REMINDER_LEAD_HOURS`), at most once per member per session via a unique-constrained `NotificationDelivery` claim
- **Durable Slack retries** — a failed delivery is persisted with a replayable descriptor and drained by later scheduler ticks with exponential backoff, up to 5 attempts before it is marked permanently failed
- **Authorized team exports** — `/api/teams/[teamId]/export` authenticates from the session cookie and returns aggregate CSV data only when the member belongs to the requested team
- **Protected session details** — session-detail GET permits ordinary members of the requested team and returns the same 404 for missing or cross-team sessions
- **Protected participation** — participation GET derives identity only from the session cookie, binds the session to the URL team, and preserves privacy-aware counts without exposing response details
- **Weighted micro-pulses** — session-link responses select weighted unanswered questions, bundle them as close approaches, and include `allQuestions` plus `expandable` for one-call expansion
- **Scoped session-link authentication** — new or reused authentication persists and emits the same earliest close/existing/seven-day bound; reuse never extends expiry and elapsed bounds use `Max-Age=0`
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
npm test            # unit + property tests (2222 tests across 223 Vitest files)
npm run test:watch  # watch mode for TDD (unit only)
npm run test:e2e    # Playwright browser tests
npm run test:a11y   # Playwright axe tests
```

| Layer | What only this layer catches |
|-------|------------------------------|
| Unit tests | Business rules, over in-memory repository fakes |
| Property tests | Invariants across generated inputs (fast-check) |
| Route tests | HTTP contract, auth, status codes |
| Real-file integration | Adapter and query behaviour — the libSQL and database-path tests run against actual SQLite files |
| Accessibility tests | WCAG violations, through jest-axe and Playwright axe-core |
| E2E tests | Hydration, cookies, navigation — invisible below this tier |
| Performance gates | Queries per route, requests per page load, layout shift |

### When each runs

The tiers are separated by speed and external dependencies, not ceremony. The
whole Vitest suite runs in about 50 seconds, so there is no reason to defer any of
it.

| Cadence | What runs |
|---------|-----------|
| Every change | `npm test` — the full Vitest suite |
| Every push and PR | The above, plus `npm run build` and the Playwright suite |
| Merge to `master` | The above, plus anything unautomatable — currently the Slack disposable-workspace pass |

E2E runs against a disposable database provisioned per run
(`e2e/global-setup.ts`), never `prisma/dev.db`, which is what makes it cheap
enough to run on every pull request rather than only at merge.

See the Testing Rules in `AGENTS.md` for how these tests must be written — in
particular, why asserting that a collaborator was called is not evidence.

### Performance

The application was slow for months and nothing in the suite noticed; it was
found by someone using it. There are gates now, set as ratchets at what the
code does today:

| Budget | Value | Where |
|---|---|---|
| Queries per `GET /api/me` | ≤ 5 | `src/tests/integration/query-budgets.test.ts` |
| Queries per `GET /api/teams/[teamId]/trends` | ≤ 8 | same |
| API requests per dashboard load | ≤ 2 | `e2e/request-budget.spec.ts` |
| Identity requests per dashboard load | 0 | same |
| Cumulative Layout Shift, dashboard | < 0.03 | same |

**No wall-clock timing runs in CI.** Those vary with the machine and would be
disabled within a month. Timings and Lighthouse are deliberate commands:

```bash
npx tsx scripts/measure-production.ts
```

See `docs/operations.md` for what the application records about itself, and
`docs/performance.md` for what each measurement isolates, the baseline to
compare against, how to point Lighthouse at a page behind a session, and why
the same metric reads differently through different tools.

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

GitHub Actions defines four PR gates:

1. **`ci`** — Install → Prisma generate/schema push → Lint → Type Check → Vitest → Build
2. **`e2e`** — Install → Prisma setup → Build → Chromium install → Playwright, after `ci`
3. **`requirement-coverage`** — Require requirement references in the PR body
4. **`requirement-references`** — Every citation in the source resolves to a
   criterion that exists, and **no section appears twice** in the narrative
   documents

Jobs run on pushes to **any** branch as well as pull requests targeting
`master`, so a feature branch is validated before review rather than only once a
PR exists. A branch with an open PR triggers both events; a `concurrency` group
keyed on the ref cancels superseded runs.

The E2E job provisions its own database: `e2e/global-setup.ts` deletes
`prisma/e2e.db`, applies the committed migrations, and seeds the canonical
questions, and `playwright.config.ts` passes that `DATABASE_URL` to the web
server. `prisma/dev.db` is never opened.

A skipped test fails the run. `e2e/no-skips-reporter.ts` overrides an otherwise
passing result if any test skipped, because Playwright treats a skip as a pass —
which is how the old happy path reported green for months while proving nothing.
Traces, screenshots, and the seeded database are uploaded on failure.

All four jobs and the uploaded Playwright evidence must pass before merge to
`master`.

The structural check is shape, not truth. It cannot tell whether a paragraph is
still accurate — only that a section is not there twice, which is the shape one
particular accident takes: 602 duplicated lines shipped in this file on
2026-09-20 through a pipeline that was entirely green, because nothing read it
for structure. A person still has to read the words.

## Working with AI assistants

- **`AGENTS.md`** — rules and architecture constraints for AI agents
- **`AI_CONTEXT.md`** — current project state. Read at session start, update with every commit.

## Spec

Feature specifications at `.kiro/specs/`:

**`team-health-check/`** — Original feature spec:
- Requirements (20 functional + 4 non-functional)
- Technical design (architecture, data models, 34 correctness properties)
- Task list (28 groups, ~120 sub-tasks)

**`integration-hardening/`** — Integration wiring spec (**complete**, 2026-08-26):
- Requirements (13 covering auth, notification wiring, Turso, E2E, and contracts)
- Technical design (12 correctness properties and integration patterns)
- Tasks 1–21 record the original implementation pass; Task 22 records browser regressions
- Tasks 23–26 closed auth/session, Slack production behaviour, automated evidence, documentation, CI, and merge. Their evidence tables record what was verified and how

**`manager-experience/`** — Manager-facing UI spec (**complete**, 2026-08-30):
- Requirements (5 functional + 2 non-functional): navigation, session lifecycle, dashboard comprehension, first-run guidance, ambiguous-identity guard
- Technical design (9 decisions, 6 correctness properties, per-tier testing strategy), with *As built* notes where implementation found something the design had not accounted for
- Tasks (9 groups, 3 checkpoints), each recording what was done, what was found, and what was mutation-checked
- `design.md` also carries a **What implementation taught** section — dates crossing JSON as strings, pinning date locales, one tick one clock, and why two test flakes came from tests outgrowing their budget rather than from the code

**`dashboard-refinement/`** — Follow-up spec (**complete**, written 2026-08-31):
- Requirements (9 functional + 2 non-functional), every one traced to a manual pass over the live application rather than to a test failure
- Technical design (7 decisions, 6 correctness properties), including an open decision on whether removing a session means deletion or exclusion
- Tasks (9 groups, 3 checkpoints), with session removal explicitly blocked until that decision is made

**`deployment/`** — Putting it somewhere a team can reach (**59 of 62 ticked**):
- Requirements (9): Vercel, Turso, migrations that cannot silently hit a local
  file, a scheduler trigger the free tier can actually run, and backups
- What stays open is one thing in three parts: a verified Resend sending
  domain, and proof that an email reaches somebody who is not the account owner
- Rolling back is written down now, including the hazard — migrations do not
  roll back with a deployment, so the schema can end up ahead of the code. It is
  safe today because every migration so far is additive, which is a property to
  keep rather than a guarantee
- Preview deployments carry no production credentials, confirmed 2026-09-23.
  They are therefore unusable, deliberately: a preview nobody can click through
  beats one pointed at the live team’s answers
- `docs/deployment.md` is the working reference: every variable, which file it
  belongs in, and what happens when each one is wrong

**`feeling-responsive/`** — Speed, after the tool felt slow to its user
(**complete**, 37 tasks):
- Written from one sentence — "generally a little slow", with the navigation
  filling in piecewise — both accurate, neither a rendering bug
- Query, request and layout-shift budgets are **ratchets**, set at measured
  values, so the next request added to a page has to be a decision

**`explaining-itself/`** — Saying what things do (**complete**, 2026-09-20):
- From a manual walk of the whole loop on production, where everything worked
  and almost nothing explained itself
- Four profile controls that never said what they affected — including a
  reminders toggle that governed two of the four messages the app sends
- **Its "prove it" phase found seven defects**, and that is the part worth
  knowing. One turned up while its browser tests were being written; six more
  when a person used the deployed application. None of them failed a test, and
  one of them had a green test written specifically about it — an assertion
  that a message did *not* say "no changes", which a message box that had not
  changed at all satisfies perfectly
- Criteria 2.6, 2.7 and the whole of Requirement 6 were added from those
  passes rather than written up front, each recording the sentence that
  prompted it

**`knowing-what-happened/`** — Giving the scheduler a voice (**complete**, 43
tasks):
- Eleven `console` calls existed in the whole codebase, and the tick that opens
  checks, closes them and sends every prompt logged nothing at all
- A tick now reports what it did *and why it did nothing*, which is the normal
  case six days a week and was previously indistinguishable from being broken

**`remembering-what-happened/`** — Giving it a memory (**complete**, 59 tasks):
- A 90-day ledger and a heartbeat, because cron-job.org keeps 50 executions and
  the dashboard could not tell "the scheduler is idle" from "the scheduler is
  dead"
- Two of its requirements came from reading the real cron dashboard rather than
  from the code: response bodies are not saved unless you ask, and the tick
  interval was five minutes rather than the "few minutes" everyone assumed

**`slack-sign-in/`** — A way in that needs no domain (**68 of 72 ticked**):
- Email was the only way into the application, and an unverified Resend sender
  delivers **only to the account owner**, dropping everyone else silently
- Proved in a real workspace on 2026-09-17, including automatic matching on the
  email address Slack has already verified. The single-use claim on a sign-in
  link had until then been proved against a JavaScript `Map` and a temporary
  file; that run proved it against Turso, through Slack
- **The pass found two defects, both by a person reading output.** The audit log
  showed an account linked twice with nothing saying how it came to be unlinked
  in between — three of the four ways a binding changes were recorded, and the
  two a member does for themselves were not. And an automatic link rendered as
  "Slack binding matched", because a third change type had been added without a
  label
- Two boxes stay open and need a second person in the workspace: what an
  unlinked stranger is told, and what Slack returns for a guest account. Every
  account in a one-person workspace matches a member, so the fallback path
  cannot be reached from inside it

**`reaching-your-health-check/`** — Answering a check from inside the app
(**50 of 51 ticked**):
- Written the day a check opened in production that nobody could answer
- Adds a route of the member's own, a second prompt channel, and a member-level
  choice between them
- One box left, and it needs a verified sending domain rather than code

**`traceability/`** — Keeping the citations true (**complete**, 22 tasks):
- Source files cite the requirement they serve, and nobody reads those citations
  until something is wrong — which is exactly when they must not be lies
- `npx tsx scripts/check-requirement-references.ts` runs in CI. It catches a
  citation that leads nowhere; only a person catches one that leads somewhere
  wrong, which is why `AGENTS.md` leads that section with a rule for people

## Known Issues & Future Work

### Design & UI

- **No design system** — components use ad-hoc Tailwind classes. A consistent design language (spacing scale, colour palette, component library) would improve cohesion. Consider adopting something like shadcn/ui or Radix primitives.
- **Dark mode not supported** — the CSS has custom property scaffolding ready for it, but pages use hardcoded light-mode Tailwind classes (`bg-gray-50`, `text-gray-800`, etc.). Dark mode would need a proper theme toggle and a pass across all pages.
- ~~**No responsive navigation**~~ — fixed. A shared shell is mounted by the `/teams/[teamId]` and `/me` segment layouts, offering Dashboard, Settings, Profile, sign out, and — for a delivery manager — the Audit log. It is deliberately absent from the home page, sign-in, and the session-link feedback form.

### Accessibility

- **Colour contrast audited and fixed** — Playwright axe runs against the unauthenticated pages (home, sign-in, genesis), the feedback states (active, confirmation, ended), settings, both dashboard states plus the expanded question drill-down, the profile page, and three states the navigation shell adds: the skip link once focused, the sign-out failure message, and the dashboard at 320px. That audit found and fixed real WCAG AA failures: `text-gray-400` at 2.48–2.6 against white, and `bg-green-600`/`text-green-600` at 3.21.
- **Reflow is checked at 320px** — the width WCAG 2.1 AA 1.4.10 specifies, being a 1280px viewport at 400% zoom. The 375px check in the navigation spec is a phone, not the criterion.
- **WCAG 2.1 AA is the standard we build towards, not a claim we make.** Every new state is checked with axe against the AA rule set, semantics are asserted in tests, and keyboard operation is driven end-to-end — but axe finds roughly a third to a half of WCAG issues and cannot judge whether announced labels and order make sense. A formal audit, including a screen-reader pass with NVDA or VoiceOver, is required before *stating* the app conforms to AA. Until then: aim for it in every change, do not claim it.
- ~~**No skip-to-content links**~~ — fixed on authenticated pages. The shell's skip link is first in tab order and its target carries `tabindex="-1"`, so activating it moves focus rather than only shifting the sequential start point. Verified end-to-end by asserting where focus lands, not that the URL gained a fragment.
- **No focus management on route transitions** — screen readers aren't notified when the page changes.
- **No reduced-motion support** — no `prefers-reduced-motion` media query handling.

### Security

- **No CSRF protection** on form submissions (session links are one-time-use tokens which helps, but dashboard forms aren't protected).
- **No rate limiting on non-auth endpoints** — the API has rate limiting on magic link requests and session-link validation, but other endpoints are unprotected.
- **Slack bot token stored in env only** — no secrets manager integration.

### Testing gaps

- **Real-workspace Slack acceptance completed** (2026-08-26) — pairing, unlink,
  `/healthcheck`, interaction replies, browser fallback, closing reminder, and a
  forced durable retry were all exercised against a disposable workspace. The
  pass found three defects invisible to the unit suite: a tunnel-origin hydration
  hang, scaffolding metadata in Slack link unfurls, and a closing reminder that
  read as an opening prompt. All three are fixed. Repeat it only if Slack
  behaviour changes.
- **Only Chromium is covered** — `playwright.config.ts` defines a single
  project. Firefox and WebKit are untested.
- **The dashboard drill-down is located by CSS class in tests** because the
  disclosure has no `aria-controls`. Adding it (a deferred UX item) would give
  tests a durable handle and improve screen-reader behaviour at the same time.
- **One unreproduced Vitest flake** (2026-08-25) — a single failure across six
  full runs, never seen since, and its identity was lost to truncated output.
  Recorded because a nondeterministic test undermines the skip and isolation
  enforcement the suite now relies on.
- **No load or performance testing** — SQLite and Turso remain untested under
  concurrent load.
