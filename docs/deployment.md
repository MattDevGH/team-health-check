# Deployment and configuration

Every environment variable the application reads, where it lives, and what
happens when it is wrong.

Written because `process.env` references were the only record, and because two
of the assumptions this project ran on for months turned out to be false: that
Vercel's free tier could run the scheduler, and that `prisma migrate deploy`
could reach the production database.

See `.kiro/specs/deployment/` for the requirements and the reasoning.

---

## Environment variables

**Secret** means: never committed, never pasted into an issue, never echoed into
a log. Everything marked secret lives only in the hosting platform's environment
configuration and in the maintainer's local `.env`.

### Required in production

| Variable | Secret | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | no | The production database, e.g. `libsql://team-health-xxx.turso.io`. Its **presence** is what selects the libSQL adapter over local SQLite. Without it a production process refuses to start — see below. |
| `TURSO_AUTH_TOKEN` | **yes** | Authenticates to Turso. |
| `NEXT_PUBLIC_APP_URL` | no | The public URL. Embedded in magic-link emails and Slack messages, so a stale value sends real people to `localhost`. |
| `CRON_SECRET` | **yes** | Authenticates `POST /api/scheduler/tick`. Generate a fresh one for production; do not reuse the development value. |
| `RESEND_API_KEY` | **yes** | Sends magic-link emails. |
| `EMAIL_SENDER` | no | The From address. Must be on a domain verified with Resend — see *Email* below. |

### Optional

| Variable | Secret | Purpose |
|---|---|---|
| `SLACK_SIGNING_SECRET` | **yes** | Verifies Slack request signatures. Absent, Slack delivery is skipped silently and the web interface works normally. |
| `SLACK_BOT_TOKEN` | **yes** | Posts as the bot. Same: absent means no Slack, not a broken app. |
| `CLOSING_REMINDER_LEAD_HOURS` | no | How long before a close to remind members. Defaults to **24** when unset, empty, or not a positive number. |
| `DATABASE_URL` | no | Which local SQLite file to open. Ignored in production, where `TURSO_DATABASE_URL` takes precedence. Used by the E2E suite to target a disposable database. |

### Must never be set in production

| Variable | Why |
|---|---|
| `TEST_MODE` | Makes `/api/test/magic-link` return **live sign-in tokens** — a complete authentication bypass for anyone who can reach the URL. The application now refuses to run if it is set in production, but it should not be there to refuse. |
| `E2E_LOCAL_RUN` | Marks a process as a local end-to-end run and *disables* the production startup checks. Set in `playwright.config.ts` and nowhere else. |

`NODE_ENV` is set by the platform and by `next build`/`next start`. Do not set it
by hand.

---

## What happens when configuration is wrong

These are guards, not documentation. `src/lib/startup-guards.ts`, called from
`src/instrumentation.ts` when a server instance starts.

**No `TURSO_DATABASE_URL` in production.** Startup fails. Without the guard the
application would open a local SQLite file — and a serverless function has no
persistent filesystem, so the file does not exist, is not shared between
instances, and is destroyed on the next deploy. The failure would look like data
vanishing rather than like a missing variable.

Measured behaviour, since "refuses to start" is not quite accurate: `next start`
logs `Failed to prepare server`, keeps listening, and answers **every request
with 500**. No request reaches a handler and no database file is created.

**`TEST_MODE` set in production.** Same: startup fails, every request 500s. The
check is deliberately broader than the route's own predicate, which enables only
on exactly `"true"` — `TEST_MODE=1` is harmless to the route but is still someone
trying to switch this on in production.

**`TURSO_DATABASE_URL` set while running the Prisma CLI.** `prisma.config.ts`
throws. See *Migrations* below for why.

---

## Migrations

`prisma migrate deploy` **cannot** reach Turso. Prisma's datasource config takes
a plain url string, this schema's provider is `sqlite`, and Prisma's own
documentation directs Turso users elsewhere.

The hazard was never that limitation — it was that the CLI would resolve a
*local* path, migrate a file on your laptop, and exit zero. It now refuses.

To migrate production:

```bash
TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npx tsx scripts/migrate-production.ts
```

It applies every migration not yet recorded, in order, then seeds the question
catalogue. Both are safe to run again: it reports what it skipped.

Deliberately a separate command, never part of a deploy. A schema change to a
database holding a team's answers is a decision, not a side effect of pressing
merge.

**Verify by reading the schema back.** An exit code is not evidence.

**If a run is interrupted** between applying a migration and recording it, the
next run reports that a table already exists. That is the expected symptom, and
the safe direction: the alternative — recording first — would mark a migration
done that never ran, and it would be discovered as a missing column months
later. Fix by inserting the missing row into `_applied_migration` by hand, once
you have confirmed the migration really did apply.

---

## The scheduler

**Vercel's Hobby plan cannot run this.** Its cron jobs are limited to **once per
day** at ±59 minutes, and a more frequent cron expression *fails at deployment*
rather than degrading.

Every timing behaviour here is finer-grained than a day: sessions open and close
at configured wall-clock times, materialisation waits 30 seconds after a close,
closing reminders fire inside a lead window, and the Slack retry queue backs off
at 30s/2m/8m/20m.

So the tick is triggered from **outside Vercel**, by a cron service calling:

```
POST https://<production-url>/api/scheduler/tick
Authorization: Bearer <CRON_SECRET>
```

Every few minutes. The endpoint is idempotent and reconciles state, so a missed
trigger costs a delay rather than a lost session — which is what makes an
external trigger acceptable at all.

GitHub Actions was considered and rejected: its scheduled runs can be *dropped*
under load, and scheduled workflows are **disabled automatically after 60 days
without repository activity** on a public repository — which bites hardest once
the project is finished and quietly relied upon.

Vercel Pro (per-minute crons, everything inside Vercel) remains the upgrade path
if the external trigger starts costing more attention than the subscription
would.

**Watch that it is still firing.** A stopped trigger is silent: sessions simply
never open, and the first report comes from a confused team.

---

## Email

`onboarding@resend.dev` delivers **only to the Resend account owner**. Every
other recipient is dropped silently — and for a magic link that is
indistinguishable from the link never being requested, because
`requestMagicLink` returns void for every input by design (anti-enumeration).

So before giving this to a team:

1. Verify a sending domain with Resend.
2. Set `EMAIL_SENDER` to an address on it.
3. Send to an address that is **not** the account owner's, and confirm arrival.

---

## Rotating a secret

Each of these lives in exactly two places. Change both, or the application will
authenticate against one and fail against the other.

| Secret | Lives in |
|---|---|
| `TURSO_AUTH_TOKEN` | Turso (issue a new token), Vercel environment variables |
| `CRON_SECRET` | Vercel environment variables, the cron service's request header |
| `RESEND_API_KEY` | Resend dashboard, Vercel environment variables |
| `SLACK_SIGNING_SECRET` | Slack app settings, Vercel environment variables |
| `SLACK_BOT_TOKEN` | Slack app settings (OAuth & Permissions), Vercel environment variables |

Plus the maintainer's local `.env`, which is gitignored and must stay that way.

`CRON_SECRET` is the one most easily half-rotated: changing it in Vercel without
changing it in the cron service stops the scheduler silently, because a refused
tick looks exactly like no tick at all.
