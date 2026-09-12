# Requirements Document

## Introduction

Every milestone so far has made the application better on one machine. This one
puts it somewhere a real delivery team can reach, with data that survives, on a
schedule that holds.

The application code is largely ready: the production database path has
execution coverage, the scheduler tick is an authenticated endpoint designed to
be triggered from outside, and the Slack retry queue persists. What is missing
is everything around it — a host, a database that is not a file on a laptop, a
trigger that fires often enough for the product's promises to be true, secrets
in the right places, and a way to tell whether a deploy worked.

Two findings shaped this spec before a line of it was written.

**The Vercel Hobby plan cannot run this scheduler.** Hobby cron jobs are limited
to once per day with ±59 minutes of precision, and a more frequent cron
expression *fails at deployment* rather than degrading. The scheduler opens and
closes sessions at configured wall-clock times, waits 30 seconds after a close
before materialising, sends closing reminders inside a lead window, and drains a
retry queue on a 30s/2m/8m/20m backoff. None of that survives a daily tick. The
README has said "Vercel (free tier)" since the first commit and was wrong about
what that buys.

**Migrations have no path to production.** `prisma.config.ts` resolves its
datasource through `resolveSqliteFileUrl()`, which always returns a local `file:`
URL and never consults `TURSO_DATABASE_URL`. The runtime can reach Turso — the
libSQL integration test executes real queries through the adapter — but the CLI
cannot. `prisma migrate deploy` against production today would migrate a local
file and report success. This is the same construction-versus-execution gap that
left the Turso adapter broken through six passing tests.

A third concern is not a finding but a standing hazard. `TEST_MODE=true` exposes
live sign-in tokens through `/api/test/magic-link`. It is inert unless set, and
nothing currently prevents it being set.

## Glossary

- **Production**: the deployed application on its public URL, holding a real
  team's responses.
- **Preview**: a Vercel deployment built from a pull request, isolated from
  production data.
- **Tick**: one `POST /api/scheduler/tick`, authenticated with `CRON_SECRET`.
  Idempotent: it reconciles state rather than assuming what has already run.
- **Trigger**: whatever causes a tick on a schedule. External to Vercel, by
  decision — see design.
- **Migration**: a file under `prisma/migrations`, applied in order.
- **Secret**: a configuration value that must not appear in the repository, a
  build log, or an error message.

## Requirements

### Requirement 1: The Application Is Reachable

**User Story:** As a delivery manager, I want to give my team a URL that works, so that they can answer a health check without me installing anything.

#### Acceptance Criteria

1. THE application SHALL be deployed to a public HTTPS URL.
2. THE deployment SHALL be produced from a commit on `master`, so that what is running can be identified.
3. WHEN a pull request is opened, THE platform SHALL build a preview deployment, and that preview SHALL NOT write to the production database.
4. THE production build SHALL run with `NODE_ENV=production`, so that the session cookie carries `Secure`.
5. `NEXT_PUBLIC_APP_URL` SHALL be the production URL, because magic-link emails and Slack messages embed it and a stale value sends people to localhost.

### Requirement 2: Data Outlives The Deployment

**User Story:** As a delivery manager, I want responses to survive a deploy, so that a release does not cost my team their history.

*Serverless functions have no persistent filesystem. A SQLite file inside the deployment is discarded on every deploy, and is not shared between concurrent function instances.*

#### Acceptance Criteria

1. THE production application SHALL use Turso through the libSQL adapter, selected by the presence of `TURSO_DATABASE_URL`.
2. THE production database SHALL be verified by executing a real query against it after deployment, not by observing that a client was constructed.
3. WHERE `TURSO_DATABASE_URL` is absent in production, THE application SHALL fail loudly at startup rather than silently opening a local SQLite file that will vanish.
4. THE application SHALL NOT write to the repository filesystem at runtime.

### Requirement 3: Migrations Reach The Database They Claim To

**User Story:** As the maintainer, I want a schema change to be applied to production deliberately and verifiably, so that I never discover a missing column from a user's error.

*Today `prisma migrate deploy` would target a local file and report success.*

*It cannot be made to target Turso. Prisma’s `Datasource` config accepts only a
url string, the schema’s provider is `sqlite`, and Prisma’s own documentation
directs Turso users to generate SQL with `prisma migrate diff` and apply it
through other tooling. So the requirement is not "point the CLI at production" —
it is "make the wrong thing impossible, and give the right thing a path".*

#### Acceptance Criteria

1. WHERE `TURSO_DATABASE_URL` is set, THE Prisma CLI configuration SHALL refuse to resolve a datasource rather than silently returning a local file path.
2. THE refusal SHALL be covered by an executable test, so that the CLI and the runtime can never quietly disagree about which database they mean.
3. THERE SHALL be a documented path that applies the committed migrations to the production database and reports which ones it applied.
4. THAT path SHALL be safe to run more than once: a migration already applied SHALL NOT be applied again.
5. Applying migrations to production SHALL be a deliberate step, never a side effect of a deploy.
6. WHEN migrations have been applied, THE production schema SHALL be verified by reading it back, not inferred from an exit code.
7. THE fixed question catalogue SHALL be seeded in production, and seeding SHALL be safe to run more than once.

### Requirement 4: The Scheduler Fires Often Enough To Keep Its Promises

**User Story:** As a delivery manager, I want a health check to open and close when I scheduled it, so that the tool's behaviour matches what the settings page told me.

*Hobby cron jobs run once a day. Every timing behaviour in this product is finer-grained than that.*

#### Acceptance Criteria

1. THE tick SHALL be triggered at an interval fine enough that a session opens and closes within a few minutes of its configured time.
2. THE trigger SHALL authenticate with `CRON_SECRET`, and an unauthenticated tick SHALL be refused.
3. WHERE a trigger is missed or dropped, THE next tick SHALL reconcile the state that the missed one would have handled.
4. THE tick endpoint SHALL remain safe to call repeatedly, including concurrently.
5. THE trigger SHALL be observable: it SHALL be possible to tell that ticks are still happening without waiting for a user to report that they are not.
6. `CRON_SECRET` SHALL be a value generated for production, not reused from development.

### Requirement 5: Test Affordances Cannot Be Switched On In Production

**User Story:** As a delivery manager, I want confidence that sign-in tokens cannot be read out of the running system, so that trusting it with candid feedback is reasonable.

*`TEST_MODE=true` exposes live magic-link tokens through `/api/test/magic-link`. It is inert unless set, and nothing prevents it being set.*

#### Acceptance Criteria

1. WHERE `NODE_ENV` is `production`, THE application SHALL refuse to start with `TEST_MODE` enabled, rather than starting and serving tokens.
2. THE refusal SHALL be covered by an executable test.
3. THE production environment SHALL NOT define `TEST_MODE` at all.

### Requirement 6: Email Reaches Real People

**User Story:** As a team member, I want the sign-in link to arrive in my inbox, so that I can answer the health check.

*`onboarding@resend.dev` delivers only to the Resend account owner. Every other recipient is silently dropped — which for a magic link is indistinguishable from the link never being requested, and `requestMagicLink` returns void for every input by design.*

#### Acceptance Criteria

1. THE production sender SHALL be an address on a domain verified with Resend.
2. Delivery to an address other than the account owner's SHALL be confirmed before the tool is given to a team.
3. WHERE an email fails to send, THE failure SHALL be visible to the maintainer, since the anti-enumeration contract means the requester is told nothing either way.

### Requirement 7: Slack Points At Production

**User Story:** As a team member, I want the Slack bot to work against the deployed app, so that I can answer from where I already am.

#### Acceptance Criteria

1. THE Slack app's request URLs SHALL point at the production domain.
2. THE production `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` SHALL be configured, and signature verification SHALL be confirmed working against production.
3. WHERE Slack credentials are absent, THE application SHALL continue to serve the web interface rather than failing to start, because Slack is optional to the product.

### Requirement 8: A Deploy Can Be Judged And Undone

**User Story:** As the maintainer, I want to know whether a deploy is healthy and to be able to reverse it, so that a bad release is a short incident rather than a long one.

#### Acceptance Criteria

1. THE deployment SHALL be verifiable by exercising a real user journey against production, not by the platform reporting a successful build.
2. THE steps to roll back to the previous deployment SHALL be documented.
3. WHERE a rollback would leave the schema ahead of the code, THAT hazard SHALL be stated, since migrations do not roll back with the deployment.
4. THE verification SHALL cover the paths that only exist in production: the Turso adapter, the external trigger, and email delivery to a real address.

### Requirement 9: The Configuration Is Written Down

**User Story:** As the maintainer returning in six months, I want one place that lists every environment variable and where it lives, so that I am not reverse-engineering it from `process.env` references.

#### Acceptance Criteria

1. THE repository SHALL document every environment variable the application reads, its purpose, and whether production requires it.
2. THE document SHALL state which values are secret and must never be committed.
3. `.env.example` SHALL list every variable with a safe placeholder.
4. No secret SHALL be committed to the repository at any point in this milestone.

## Non-Functional Requirements

### NFR 1: Cost

1. THE deployment SHALL run within free tiers where doing so does not compromise a functional requirement.
2. WHERE a free tier cannot meet a requirement, THAT SHALL be recorded as a deliberate decision with its cost, rather than silently accepted as degraded behaviour.

### NFR 2: Secrecy

1. Secrets SHALL exist only in the hosting platform's environment configuration and the maintainer's local `.env`.
2. A secret SHALL NOT be echoed into a build log, an error message, or a test fixture.
3. WHERE a secret is rotated, THE places holding it SHALL be enumerated in the documentation so that none is missed.

### NFR 3: Reversibility

1. Every step in this milestone SHALL be reversible, or SHALL state plainly that it is not.
2. THE production database SHALL have a stated backup position before it holds a real team's data.
