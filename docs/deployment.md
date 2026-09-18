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

## Which file does a value belong in?

Next.js loads exactly five sources, first match winning, so earlier entries
override later ones:

| | Source | Loaded when |
|---|---|---|
| 1 | the real environment | always — a shell variable beats every file |
| 2 | `.env.<NODE_ENV>.local` | e.g. `.env.development.local` |
| 3 | `.env.local` | **not** when `NODE_ENV=test` |
| 4 | `.env.<NODE_ENV>` | e.g. `.env.production` |
| 5 | `.env` | always |

Which gives three homes:

**`.env.local`** — your machine’s development secrets. Skipped during tests by
design, so a test run uses the same defaults for everyone.

**`.env.turso`** — the production database credentials, and nothing else.
Deliberately a name Next.js has never heard of. Put them in `.env` and they do
not merely configure the migration script: they repoint the **dev server** at
production and disable the Prisma CLI for as long as they sit there. Read by
`scripts/migrate-production.ts` and by nothing else.

**Vercel** — everything production actually runs on. Never a file.

An explicit `TURSO_DATABASE_URL=… npx tsx …` still overrides both files, so
targeting a different database for one run never means editing a file and
remembering to put it back.

`.gitignore` ignores `.env*` with `!.env.example`. A wildcard rather than a
list, because the list missed `.env.development.local`, `.env.test.local` and
anything added later — and a committed token is a rotation, not a deletion.

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

**`TURSO_DATABASE_URL` set while running a Prisma command that connects.**
`prisma.config.ts` throws. Scoped to commands that actually open a database —
`migrate`, `db push`, `db execute`, `studio` — because `generate`, `format`,
`validate` and `version` only read the schema and cannot migrate anything.

That scoping was learned from a failed deployment. The guard originally refused
every command, which meant the production build could not generate its Prisma
client and failed with `Can’t resolve '@/generated/prisma'` — a message that
looks nothing like a guard working as intended. The host supplies
`TURSO_DATABASE_URL` to the build as well as the runtime.

The allowlist fails closed: an unrecognised command is treated as connecting.
Being wrong that way costs a loud error; the other way costs a migration
applied to a database nobody meant to touch.

**The build generates the Prisma client.** `npm run build` is
`prisma generate && next build`, because `src/generated/prisma` is gitignored
and nothing else creates it on a fresh checkout.


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

**Applied 2026-09-18: `20260918000000_add_email_prompts_enabled`.** Additive and
nullable. It had to go in before the deploy that carried the code, not after:
Prisma selects every column by name, so an unmigrated production could not have
read a `TeamMember` row at all — no sign-in, no profile, no dashboard. The
window between merging and migrating is the risk, and it is the reason to run
the migration the moment a schema change merges rather than at leisure.

**Applied 2026-09-15: `20260914212427_add_materialised_at` and
`20260915111500_backfill_materialised_at`.** The first adds
`HealthCheckSession.materialisedAt`, which the dashboard reads to tell "results
not computed yet" from "nobody answered".

The second exists because production carried a closed session with no responses
and therefore no output to infer materialisation from. Left alone, the dashboard
would have reported that the scheduler might not be running, about a check that
closed exactly as it should have. The backfill claims only what is true of rows
that predate the column — they have all had their chance — and its cutoff is the
moment the column was added, so a check closing now still records its own time.

**If a run is interrupted** between applying a migration and recording it, the
next run reports that a table already exists. That is the expected symptom, and
the safe direction: the alternative — recording first — would mark a migration
done that never ran, and it would be discovered as a missing column months
later. Fix by inserting the missing row into `_applied_migration` by hand, once
you have confirmed the migration really did apply.

---

## The production environment

| | |
|---|---|
| Host | Vercel |
| Production branch | `master` — a merge deploys |
| Production URL | https://team-health-check-pi.vercel.app |
| Database | Turso, eu-west-1 (Dublin) |
| First deployed | 2026-09-13 |

Verified live after the first deploy: `/` and `/auth/login` return 200, and
`/api/me` returns **401**. That 401 is the one worth checking — if
`TURSO_DATABASE_URL` were missing the startup guard would abort and *every*
request would be 500, because the guard runs at server start rather than at
build. A clean refusal means the app is running and reached its configuration.

**Environment variables are scoped to Production only**, deliberately. A
preview deployment therefore starts with none of them, hits the
`TURSO_DATABASE_URL` guard, and answers every request with 500.

That is the correct posture — Requirement 1.3 says a preview must never write
to the production database, and the surest way to guarantee that is to give it
no credentials at all. But it means **a failing preview deployment on a pull
request is expected and is not a signal worth chasing.** Judge a change by the
CI checks, not by Vercel’s preview.

### `NEXT_PUBLIC_APP_URL` has three traps in it

Worth knowing before anyone changes it.

**It is frozen at build time.** Next.js inlines `NEXT_PUBLIC_*` into the
JavaScript sent to the browser, so changing it in the host and restarting does
nothing. It needs a redeploy.

**Unset, it silently becomes `http://localhost:3000`** — the fallback in
`auth.service.ts`, `container.ts` and `production-notification-sink.ts`. Magic
links and Slack links would then point at a machine that is not there. Nothing
fails; the build is green.

**It is a *fallback* for the `Secure` cookie flag, not the decider.**
`session-cookie.ts` sets `secure` when `NODE_ENV === 'production'` **or** when
this value starts with `https://`. On a real deployment the first condition is
already true, so `Secure` does not depend on this variable.

This document claimed the opposite until 2026-09-13 — that leaving the variable
unset would cost production its `Secure` cookies. It would not. The `https://`
check only matters where `NODE_ENV` is not production and the app is served
over TLS anyway: a tunnel, or a self-hosted preview. Corrected rather than
quietly deleted, because a security claim that turns out to be false is worth
knowing was ever made.

It must also have **no trailing slash**: `production-notification-sink.ts`
appends `/session/<token>` directly, and a trailing slash produces a double
slash that may not match the route — a link that 404s for a member with no way
for them to tell you anything useful.

On Vercel it must be a **Config** variable, not a Secret. The value is public
by definition, since it is compiled into the browser bundle, and the type
cannot be changed after creation — a variable created as Secret has to be
deleted and recreated.

---

## Backups

The production database is **eu-west-1 (Dublin)**.

**Stated position as of 2026-09-13: there is no automatic backup, and no
point-in-time restore on the current plan.** The dashboard offers a manual
**export** and nothing else. That is recorded rather than assumed, which is
what NFR 3.2 asks for — "none" is an acceptable answer for a tool trialling
with one team, provided nobody later believes otherwise.

What this means in practice: **a mistaken delete or a bad migration is
unrecoverable** unless an export was taken first. The two moments that warrant
one are before running `scripts/migrate-production.ts` against a database that
already holds responses, and before any manual `DELETE` or `UPDATE`.

Revisit if the tool is adopted beyond a trial. A team’s candid feedback is not
data you can ask them to re-enter.

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

Every few minutes. The endpoint reconciles state rather than firing on an exact
clock reading, so a missed or late trigger costs a delay rather than a lost
session — which is what makes an external trigger acceptable at all.

**That was not true until 2026-09-14.** The scheduler compared the local time
to the configured open time as strings, so a tick one minute late opened
nothing and a day of five-minute ticks opened nothing at all. Opening and
closing are now decided from stored state. If you are reading this against an
older deployment, check `scheduler.service.ts` before trusting the paragraph
above.

GitHub Actions was considered and rejected: its scheduled runs can be *dropped*
under load, and scheduled workflows are **disabled automatically after 60 days
without repository activity** on a public repository — which bites hardest once
the project is finished and quietly relied upon.

Vercel Pro (per-minute crons, everything inside Vercel) remains the upgrade path
if the external trigger starts costing more attention than the subscription
would.

### Turn on "save responses", or the tick talks to nobody

The tick answers with a sentence saying what it did and, when it did nothing,
why — see `docs/operations.md`. **cron-job.org does not show you that by
default.** The execution list shows `200 OK` and nothing more.

In the job's settings, enable **save responses** (`saveResponses` over the REST
API). The job history then shows the response headers and body for each run.

Two limits worth knowing before you rely on it:

- the **last 50 executions** only
- headers and bodies are kept for **two days**

The first is the one that binds. Fifty executions is counted in ticks, not in
time, so the window is whatever fifty of your ticks span:

| Tick interval | 50 executions span |
|---|---|
| 1 minute | 50 minutes |
| **5 minutes — the interval in use** | **4 hours 10 minutes** |
| 15 minutes | 12 hours 30 minutes |
| 30 minutes | 25 hours |

**Measured, not assumed:** two consecutive production heartbeats on 2026-09-16
were 305 seconds apart. If the cron service's schedule is ever changed, this row
changes with it.

At any interval under about an hour, the two days never arrive. And what
survives is the most *recent* fifty, not the most interesting: on a weekly
cadence the handful of ticks that opened or closed a check are pushed out within
hours by the quiet ones that follow them.

Treat it as a window, not a record. It answers "what did it just do?" and cannot
answer "what happened on Monday".

**The logs are not a fallback.** Every event the recorder writes goes to Vercel's
runtime logs, and the Hobby plan keeps those for **one hour**.

**Where the summary should live instead is open work.** Two days of third-party
retention, behind a setting that is off by default, is a thin place to keep the
only account of what the scheduler does. The obvious alternative is the
application itself: the dashboard already says "Results are overdue — the
scheduler may not be running", which is the interface guessing at something the
tick now knows for certain.

**Watch that it is still firing.** A stopped trigger is silent: sessions simply
never open, and the first report comes from a confused team. The response body
does not help here — a trigger that has stopped sends no response at all, so
whatever watches for that has to live somewhere the tick is not.

Which is what `SchedulerHeartbeat` is for. Every tick writes one row saying
when it ran and what it did, replaced each time, and it survives both the
dashboard's fifty executions and Vercel's hour. **No row at all means the
scheduler has never run** — the shape a misconfigured `CRON_SECRET` takes.

**This needs a migration.** `20260916140000_add_scheduler_heartbeat` is
additive — it creates a table and alters nothing — so the currently deployed
application keeps working until it is replaced. Take an export first anyway;
the rule is about the database holding a team's answers, not about how risky
this particular statement looks.

---

## The two ways in

Somebody signs in by **email** or from **Slack**. Either alone is enough, and
production refuses to start with neither — the application would otherwise
accept an address, say "check your email", and send nothing.

| Route | Needs | Gets you |
|---|---|---|
| Magic link by email | `RESEND_API_KEY`, and a **verified sending domain** | Anybody with an address on a team |
| `/healthcheck signin` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Anybody whose Slack account is linked to a member |
| …with no setup at all | the above plus `users:read`, `users:read.email` | Anybody whose Slack email matches a member |

**With email only**, everything works as it always has.

**With Slack only**, a delivery manager records each member's Slack ID in team
settings and those members sign in with `/healthcheck signin`. This is the
arrangement that makes a trial possible without owning a domain, which is the
problem the whole `slack-sign-in` spec was written to solve.

**With Slack and the two `users:read` scopes**, nobody needs setting up: a
member runs the command and is matched to their team by the address Slack has
already verified. Without the scopes the same command falls back to the manual
path rather than failing — look for `slack.email.unavailable` in the log, which
carries Slack's own error, so `missing_scope` is visible rather than inferred.

A Slack email match never *creates* a member. Being in the workspace is not
being on a team.

## The two ways out

Signing in and being told there is something to answer are different problems
with different failure modes, and the second one is easier to get wrong because
nobody complains about a message they never knew to expect.

| Channel | Needs | Reaches |
|---|---|---|
| Slack prompt | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, member's Slack account linked | Members with a Slack link |
| Email prompt | `RESEND_API_KEY`, `EMAIL_SENDER`, **verified sending domain**, an address on the member | Members with an address |

**Until 2026-09-18 there was only one.** The scheduler tick called
`sendSlackPrompt` and nothing else, so a deployment with Resend configured and
no Slack opened checks on schedule and told nobody. It was found in production
on 2026-09-14, on this deployment, and the `reaching-your-health-check` spec
exists because of it.

**With neither**, the scheduler still opens and closes checks and members can
still answer: the dashboard and the Health check route both offer the current
check to anybody signed in. Nothing tells them to look.

**With Slack only**, linked members are prompted. Anyone unlinked is in the
situation above — which is worth checking against your member list rather than
assuming, because it is invisible from the tick's response.

**With email only**, every member with an address is prompted. The sending
domain matters here exactly as much as it does for sign-in: `onboarding@resend.dev`
delivers only to the Resend account owner and drops everything else silently.

**With both**, each member gets whichever channels apply to them, attempted
independently — a Resend outage does not stop Slack prompts, and vice versa. A
member who has expressed no preference gets Slack alone if they have a link and
email if they do not.

The member's own choice lives on their profile page (**Email prompts**) and
governs prompts only. No preference can stop a sign-in link; that is asserted
as a property, not a convention.

### What to look for when nobody was prompted

The tick's response body says what it did, and `prompts` counts **members
reached**, not messages sent — somebody who got both has been prompted once as
far as that number is concerned. A tick that opened a check and prompted nobody
is the symptom this section exists for.

Delivery failures are recorded with ids only, never an address or a session
token: look for `notification.email_prompt.failed` and its Slack equivalent.

One hole is known and deliberate: a Slack-linked member who has chosen nothing
hears nothing if Slack delivery fails, because email defaults off for them.
Closing it needs the retry queue to report outcomes, and it is on the roadmap
rather than built.

## Email

`onboarding@resend.dev` delivers **only to the Resend account owner**. Every
other recipient is dropped silently — and for a magic link that is
indistinguishable from the link never being requested, because
`requestMagicLink` returns void for every input by design (anti-enumeration).

**This is the defect that motivated Slack sign-in.** A colleague who cannot
receive mail sees "check your email" and waits for ever, with nothing in any
log to say why — so the tool could not be trialled with a team unless its owner
also owned a domain. If you have Slack configured you can skip this section
entirely.

Otherwise, before giving this to a team:

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
