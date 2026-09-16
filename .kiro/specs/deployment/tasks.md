# Implementation Plan

Code first, then accounts, then the deploy, then proof. The guards exist before
anything is deployed, so a misconfiguration cannot go live quietly while we are
still setting it up.

Tasks 1–3 are ordinary TDD and can be done entirely offline. Task 4 onward needs
accounts and credentials, and every step in it is a thing only the maintainer can
do — noted where that is the case.

---

**Status, reconciled 2026-09-15.** This file showed 0 of 62 ticked while the
application had been live in production for two days. Every box below was
checked against the code, the test that exercises it, or the deployed
application itself — one at a time, never in bulk. The 2026-08-23 closure audit
found the opposite failure, tasks marked complete before the behaviour existed,
and it cost days.

Three things were verified against production during the reconciliation rather
than taken on trust: an unauthenticated `POST /api/scheduler/tick` is refused
(403, and 403 again with a wrong secret), the schema and the five seeded
questions read back correctly, and the two mutation checks the tasks asked for
were re-run.

One task had drifted and is corrected below: `prisma validate` no longer fails
against a Turso URL, deliberately.

What stays unticked is genuinely undone — Resend's domain, Slack's production
URLs, and the rollback note — with one exception noted where it cannot be
verified from the repository.

---

## Phase 1 — Make a wrong configuration impossible

### 1.1 A production process without a database refuses to start

- [x] Failing test: `createPrismaClient()` throws when `NODE_ENV` is `production`
      and `TURSO_DATABASE_URL` is absent
- [x] Failing test: it still falls back to local SQLite outside production, so
      development and the test suites are untouched
- [x] Failing test: the message names the missing variable, because the reader is
      someone staring at a failed deployment
- [x] Implement in `src/lib/prisma.ts`
- [x] Mutation check: remove the guard and watch the production test fail
- _Requirements: 2.1, 2.3_
- _Property: 1_

### 1.2 The Prisma CLI refuses to run against production

- [x] Failing test: `resolveSqliteFileUrl()` — or a wrapper used by
      `prisma.config.ts` — throws when `TURSO_DATABASE_URL` is set
- [x] Failing test: the message names `scripts/migrate-production.ts`, so the
      refusal points at the way forward rather than just saying no
- [x] Failing test: normal local resolution is unchanged
- [x] Implement, keeping `src/lib/database-url.ts` the single source both the
      runtime and `prisma.config.ts` consult
- [x] Verify by hand: a Prisma CLI command that connects fails with the new
      message rather than migrating a local file. *(Was `prisma validate`.
      Corrected 2026-09-15: `validate` is allowlisted deliberately — it reads the
      schema without connecting, and blocking it broke `npm run build` on Vercel,
      which runs `prisma generate`. Verified with `prisma migrate status`, which
      is refused and names `scripts/migrate-production.ts`.)*
- _Requirements: 3.1, 3.2_
- _Property: 2_

### 1.3 A production process cannot serve test tokens

- [x] Failing test: importing the guard with `NODE_ENV=production` and
      `TEST_MODE=true` throws
- [x] Failing test: production without `TEST_MODE` is fine; non-production with
      `TEST_MODE` is fine
- [x] Implement at module load, not inside the request handler
- [x] Confirm `/api/test/magic-link` still returns a bare 404 outside `TEST_MODE`
- _Requirements: 5.1, 5.2_
- _Property: 5_

**Checkpoint:** the three ways this deployment could silently do the wrong thing
are now loud. Commit each separately; open one PR for the phase.

---

## Phase 2 — A migration path that reaches production

### 2.1 Apply committed migrations through libSQL, idempotently

- [x] Failing test, against a real temporary file: applying the migration set
      creates the expected tables
- [x] Failing test: applying it a second time applies nothing and leaves the
      schema unchanged — the property that makes the script safe to re-run
- [x] Failing test: migrations are applied in lexicographic directory order
- [x] Failing test: a partially-applied set resumes from the right place
- [x] Implement `scripts/migrate-production.ts` with the `_applied_migration`
      ledger, reusing the `executeMultiple` mechanism already proven in
      `src/tests/integration/libsql-repository.test.ts`
- [x] The script prints which migrations it applied and which it skipped
- _Requirements: 3.3, 3.4_
- _Properties: 3, 4_

### 2.2 Seeding is safe to repeat

- [x] Failing test: seeding the fixed question catalogue twice leaves five rows,
      not ten
- [x] Implement or confirm `prisma/seed.ts` upserts rather than inserts
- [x] Confirm the seed can run against Turso through the same client the
      migration script uses
- _Requirements: 3.7_

**Checkpoint:** a schema change now has a path to production that reports what it
did. Open a PR for the phase.

---

## Phase 3 — Write the configuration down

### 3.1 Document every environment variable

- [x] `docs/deployment.md`: every variable the application reads, its purpose,
      whether production requires it, and whether it is secret
- [x] Include the ones that surprised us: `NEXT_PUBLIC_APP_URL` is embedded in
      emails and Slack messages, and `CLOSING_REMINDER_LEAD_HOURS` defaults to 24
- [x] State plainly that `TEST_MODE` must never be defined in production, and
      that the application now refuses to start if it is
- [x] Update `.env.example` so every variable is listed with a safe placeholder
- [x] Rotation list: where each secret lives, so none is missed
- _Requirements: 9.1, 9.2, 9.3_

### 3.2 Correct the free-tier claim

- [x] README and AI_CONTEXT currently say "Vercel (free tier)" without
      qualification. Record what Hobby actually buys, why the scheduler is
      triggered externally, and what upgrading to Pro would simplify
- _Requirements: NFR 1.2_

---

## Phase 4 — Provision (maintainer only)

Each of these needs an account or a credential and cannot be done from the
repository.

### 4.1 Turso database

- [x] Create the production database; note its region
- [x] Generate an auth token
- [x] Record the backup position: what Turso's plan provides, and what the
      maintainer would do to recover
- [x] **Never commit either value**
- _Requirements: 2.1, NFR 2.1, NFR 3.2_

### 4.2 Apply the schema

- [x] Run `scripts/migrate-production.ts` against Turso
- [x] Seed the question catalogue
- [x] Verify by reading the schema back and counting the five questions — not by
      trusting the exit code
- _Requirements: 3.5, 3.6, 3.7_

### 4.3 Resend

- [ ] Verify a sending domain
- [ ] Set the production sender to an address on it
- [ ] Send a test email to an address that is **not** the account owner's, and
      confirm arrival — the sandbox sender drops everyone else silently, and a
      dropped magic link is indistinguishable from one never requested
- _Requirements: 6.1, 6.2_

### 4.4 Vercel project

- [x] Connect the repository; confirm production builds from `master`
- [x] Set every production environment variable from `docs/deployment.md`
- [x] Generate a fresh `CRON_SECRET` for production — not the development value
- [ ] Confirm preview deployments do not carry production database credentials
      — needs the Vercel dashboard, so it cannot be verified from here
- [x] Deploy
- _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.6, NFR 2.1_

### 4.5 The external trigger

- [x] Configure the chosen service to `POST /api/scheduler/tick` with the
      `Authorization: Bearer <CRON_SECRET>` header
- [x] Choose an interval fine enough to open and close a session near its time
- [x] Confirm an unauthenticated POST is refused
- [x] Establish how a stopped trigger would be noticed. Three ways, none of
      them an alert: the dashboard says "Results are overdue — the scheduler
      may not be running" when a closed check has no aggregates after 15
      minutes; the tick’s response now carries what it did, and cron-job.org
      shows that response; and `tick.started` / `tick.finished` are in the
      logs with a run id. Making one of them page somebody is a separate
      decision — see `.kiro/specs/knowing-what-happened/`
- _Requirements: 4.1, 4.2, 4.5, 4.6_

### 4.6 Slack

- [ ] Point the app's request URLs at the production domain
- [ ] Set the production signing secret and bot token
- [ ] Confirm signature verification works against production
- _Requirements: 7.1, 7.2_

---

## Phase 5 — Prove it works

### 5.1 A real journey against production

Not a smoke test. The same shape of pass that has found every significant defect
in this project.

- [x] Request a magic link; confirm the email arrives at a real address
- [x] Sign in; confirm the dashboard loads. *(The `Secure` half is unverified
      in production: the code sets it whenever `NODE_ENV === 'production'` and
      that path has unit coverage, but nobody has read the response header from
      the deployed application.)*
- [x] Open a health check; answer it from the session link
- [x] Close it; confirm results appear after a tick, not before
- [x] Cross-check one aggregate against the Turso database directly
- [x] Confirm the trigger is still firing an hour later
- _Requirements: 1.1, 2.2, 4.1, 8.1, 8.4_

### 5.2 Rollback

- [ ] Document how to promote the previous deployment
- [ ] State the hazard plainly: migrations do not roll back with the
      deployment, so a rollback can leave the schema ahead of the code
- _Requirements: 8.2, 8.3_

### 5.3 Reconcile

- [x] Update README and AI_CONTEXT with the deployed state
- [x] Record what the manual pass found, including anything that only appeared
      in production
- [x] Run the full gate set and merge
- _Requirements: 9.1_

---

## Roadmap, deliberately unscheduled

- **Custom domain.** Changes `NEXT_PUBLIC_APP_URL`, the Slack request URLs and
  the Resend sender together; worth doing as one deliberate change rather than
  drifting into it.
- **Vercel Pro.** Would remove the external trigger entirely. The moment to
  revisit is when the trigger's reliability starts costing more attention than
  the subscription would.
- **Postgres, if concurrency ever becomes the problem.** SQLite allows **one
  writer at a time**. For one delivery team answering five questions a week
  that is nowhere near a concern, and this is recorded as a known ceiling
  rather than as anticipated work — the honest expectation is that it is never
  reached.

  The trigger to revisit is write contention: several teams answering at once,
  or a scheduler tick materialising aggregates while members are still
  submitting. Symptoms would be `SQLITE_BUSY` errors or timeouts under load,
  not gradual slowness.

  Neon (serverless Postgres) was considered during this milestone and would
  have been a defensible original choice. It would also have removed phase 2
  entirely: `prisma migrate deploy` reaches Neon natively, and the custom
  migration script exists *only* because Prisma cannot reach Turso. What Turso
  buys in exchange is dev/prod parity — the local file and production run the
  same engine, so a query that works on a laptop works deployed.

  The cost of switching, so nobody underestimates it later: change the Prisma
  provider, rewrite all three migrations in Postgres dialect, re-verify every
  date and boolean mapping, and set up Postgres for local development. A real
  project, not a configuration change.

- **Session exclusion with a recorded reason.** Still unscheduled, still
  exclusion over deletion.
