# Design Document

## Overview

Vercel serves the application. Turso holds the data. An external scheduler
triggers the tick. Migrations are applied deliberately, by a script, never by a
deploy.

Most of this milestone is configuration rather than application code. The code
that does change exists to make a wrong configuration impossible to hold
quietly — a database that is not there, a CLI pointed at the wrong file, a test
endpoint left switched on. This project's recurring failure is not code that
breaks; it is code that succeeds against the wrong thing and says nothing.

## Key Decisions

### 1. The scheduler is triggered from outside Vercel

Vercel Hobby cron jobs run **once per day** with ±59 minutes of precision, and a
finer cron expression fails at deployment rather than degrading. Every timing
behaviour in this product is finer-grained than a day: sessions open and close at
configured wall-clock times, materialisation waits 30 seconds after a close,
closing reminders fire inside a lead window, and the Slack retry queue backs off
at 30s/2m/8m/20m.

The alternatives were Vercel Pro at roughly £20 a month, GitHub Actions, or
accepting a daily tick. **An external cron service was chosen** (agreed
2026-09-12): it keeps the hosting free, and `POST /api/scheduler/tick` was
already built as an authenticated endpoint meant to be called from outside, so
nothing in the application changes to accommodate it.

GitHub Actions was rejected despite being free and close to the code. Its
documentation states that scheduled runs "can be delayed during periods of high
loads" and "some queued jobs may be dropped", and that scheduled workflows are
**automatically disabled after 60 days without repository activity** on a public
repository. The last is the dangerous one: it bites hardest exactly when the
project is finished and stable, which is when a health-check tool is most likely
to be quietly relied upon.

The tick is idempotent and reconciles state, so a missed trigger costs a delay
rather than a lost session. That property is what makes an external trigger
acceptable at all, and it is why Requirement 4.3 and 4.4 exist.

### 1a. The tick acts on state, not on the minute — corrected 2026-09-14

Decision 1 said the tick "is idempotent and reconciles state, so a missed
trigger costs a delay rather than a lost session", and gave that as the reason
an external trigger was acceptable at all.

**That was false when written.** The scheduler compared
`getLocalDayAndTime(now).time` to `schedule.openTime` as strings, so a session
opened only if a tick landed on the exact configured minute. Proven by
execution: a tick one minute late opened nothing, and a full day of
five-minute ticks opened nothing at all — silently, because there is nothing
exceptional about the time not being 09:00. Closing had the same defect, which
would have left a check collecting forever.

It survived because unit tests hand `tick` the exact minute, so the condition
was true in every test and could only be false in the wild. It was found by
asking what a real cron every five minutes would do — not by any test.

**Now level-triggered.** Closing compares the session’s stored
`scheduledCloseAt` to `now`, with no staleness bound: a session past its close
is still collecting, and however late, ending it is right. Opening asks which
cycle we are in — `previousOccurrenceUtc`, built on the existing DST-safe
arithmetic — and whether any session has already served it.

Two judgement calls are worth recording. **A missed open is not reopened once
the collection window has passed**: a check exists to gather answers between
open and close, and opening after the close would create a session immediately
overdue and prompt a team after the fact. A trigger down for a week costs that
week and says so by leaving no session, rather than quietly producing a
misdated one. **A closed check is not reopened within its own cycle**, so
ending one early stays ended.

Only now is the external-trigger decision sound rather than lucky. Vercel
Hobby’s ±59 minutes was never merely imprecise — under the old comparison it
would have opened nothing, ever.

### 2. Turso is selected by the presence of `TURSO_DATABASE_URL`, and its absence is fatal

`createPrismaClient()` already branches on `TURSO_DATABASE_URL`. The gap is what
happens when it is missing in production: today the application silently opens
`prisma/dev.db` inside the deployment. That file does not exist, is not shared
between function instances, and is destroyed on the next deploy — so the failure
looks like data vanishing rather than like a misconfiguration.

Production will therefore **refuse to start** without it. A configuration error
should be a deployment that does not go live, not a deployment that quietly
loses answers.

### 3. The Prisma CLI is forbidden from running against production, rather than pointed at it

`prisma migrate deploy` cannot target Turso. `Datasource` accepts only a url
string, the schema's provider is `sqlite`, and Prisma's own documentation
directs Turso users to generate SQL and apply it with other tooling.

The hazard is not that the CLI cannot reach production. It is that
`prisma.config.ts` resolves its url through `resolveSqliteFileUrl()`, which
ignores `TURSO_DATABASE_URL` entirely and returns a local file path — so running
`prisma migrate deploy` with production credentials in the environment migrates a
local file and exits zero. It reports success for work it did not do, which is
the exact failure mode this repository has a testing rule about.

So `prisma.config.ts` will **throw** when `TURSO_DATABASE_URL` is set, naming the
script to use instead.

### 4. Migrations are applied by a script that reuses a proven mechanism

`src/tests/integration/libsql-repository.test.ts` already applies every committed
migration through `@libsql/client` with `executeMultiple`, in sorted order. That
mechanism is under test, which is a better starting point than a second tool.

`scripts/migrate-production.ts` will do the same against Turso, with two
additions the test does not need: it records what it applied, and it skips what
is already recorded.

**The ledger is our own table, not Prisma's `_prisma_migrations`.** Prisma's
table carries a checksum whose derivation we would be guessing at, and a
mismatched checksum makes Prisma tooling refuse to proceed — a self-inflicted
wound for a table no Prisma command will ever read on Turso, since the CLI
cannot connect there. A small, honest `_applied_migration(name, applied_at)` says
exactly what it knows. The cost is recorded here: if the database is ever moved
somewhere Prisma *can* migrate, that history has to be reconciled by hand.

### 5. `TEST_MODE` becomes impossible in production rather than merely unset

`/api/test/magic-link` returns live sign-in tokens when `TEST_MODE=true`. It is
inert otherwise, and the plan has always been "do not set it in production" —
which is a hope, not a control.

The guard belongs at module load, not inside the handler: a process that can
serve tokens should not be running at all. `NODE_ENV === 'production'` together
with an enabled `TEST_MODE` is a configuration that must abort the boot.

### 6. Verification exercises production, not the build log

A green Vercel build says the bundle compiled. It says nothing about whether
Turso is reachable, whether the trigger fires, or whether email arrives. Those
three are precisely the paths that exist *only* in production and therefore have
never run.

Verification is a real journey against the production URL: sign in by email,
open a check, answer it, close it, wait for a tick to materialise, read the
dashboard, and cross-check a value against the database directly. This mirrors
the manual passes that have found every significant defect in this project.

## Correctness Properties

1. **A production process without a database does not serve requests.** For any
   environment where `NODE_ENV` is `production` and `TURSO_DATABASE_URL` is
   absent, client construction fails.
2. **The CLI and the runtime never disagree about the database.** For any
   environment, either both resolve the same target or the CLI refuses.
3. **Migration application is idempotent.** Applying the migration set twice
   leaves the same schema and the same ledger as applying it once.
4. **Migration order is stable.** Migrations are applied in lexicographic order
   of directory name, which is the order Prisma creates them in.
5. **A production process cannot serve test tokens.** For any environment where
   `NODE_ENV` is `production`, an enabled `TEST_MODE` prevents startup.
6. **The tick is safe to repeat.** Two ticks for the same instant produce the
   same state as one, including under concurrency — already guaranteed by the
   `NotificationDelivery` unique constraint and the session reconciliation.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Turso absence is fatal in production | Unit | Pure environment logic; no database needed |
| CLI refuses under `TURSO_DATABASE_URL` | Unit | Config resolution is a function |
| Migration script applies and skips correctly | Integration, real file | `@libsql/client` accepts a local `file:` URL, so the production mechanism runs with no account |
| `TEST_MODE` aborts a production boot | Unit | Module-load behaviour, asserted by importing under a set environment |
| Turso actually answers queries | Manual, against production | No local substitute proves a remote database is reachable |
| The trigger fires on schedule | Manual, against production | Nothing local can prove a third-party scheduler is calling |
| Email reaches a non-owner address | Manual, against production | Resend's sandbox sender silently drops everyone else |

The three manual rows are not a gap to be closed with more tests. They are the
parts that only exist once deployed, and this project's record is that those are
exactly where defects live.

## Out Of Scope

- **Custom domain.** The Vercel-provided URL is sufficient to trial with one
  team. A domain changes `NEXT_PUBLIC_APP_URL`, the Slack request URLs and the
  Resend verified sender together, and is better done as one deliberate change.
- **Multi-region or replicas.** One Turso database, one region.
- **Uptime monitoring and alerting** beyond being able to tell that ticks are
  happening.
- **Staging environment.** Preview deployments cover the review case; a
  long-lived staging environment needs its own database and its own secrets.
- **Backups automation.** A stated backup position is required (NFR 3.2); an
  automated schedule is not.
- **Session removal / exclusion**, still deliberately unscheduled.
