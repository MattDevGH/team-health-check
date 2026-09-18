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

**Current branch status:** Integration hardening is on `feat/integration-hardening`,
pushed and green in GitHub Actions (`ci` and `e2e`; `requirement-coverage` runs
only on pull requests and has never executed). Preserve the persistent
`prisma/dev.db` and do not start the lifecycle-management milestone yet.

The 2026-08-23 closure audit found unsupported completion claims in auth, Slack
production wiring, Playwright/isolation, MSW contracts, and libSQL evidence.
**Tasks 23, 24, and 25 are now complete**, each closing the gap the audit named
and several the audit did not:

- the Turso production path was broken and would have failed on its first query
- the runtime ignored `DATABASE_URL`, so E2E runs wrote to the development database
- closing reminders arrived indistinguishable from opening prompts
- Slack link unfurls advertised the starter template's name
- pages hung on "Loading" over a tunnel because dev assets were blocked
- four pages carried WCAG AA contrast failures

**Task 26 (reconcile and merge) is the only work remaining.**

## Latest Manual Acceptance Checkpoint — 2026-08-23

**Resume cue:** Browser acceptance through the first two health-check sessions
is complete. Do not recreate those sessions or repeat those scenarios unless a
regression requires it. Preserve the current worktree and persistent
`prisma/dev.db`. Task 23 auth/session/audit closure is complete, including
atomic actor-bound schedule and team-member-addition audits. Task 23 is fully
reconciled, and Task 24.1 (secure authenticated Slack pairing and truthful
unlink behavior), Task 24.2 (actionable cadence-aware `/healthcheck` plus
availability/delivery-window eligibility for bot-initiated prompts), Task 24.3a
(member-visible interaction replies), and Task 24.3 (closing reminders, nudge
eligibility, and route-level tick tests), Task 24.4 (persistent Slack retry queue
with draining), and Task 24.5/24.5a (disposable-workspace acceptance) are
complete. **Task 24 is closed.** **Task 25 is closed.** Resume with Task 26 (reconciliation and merge).

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

### Integration-hardening closure audit — outcome

The original Tasks 1–21 were checked too early. Task 22 records the accepted
regressions above. The audit's four waves are now resolved:

1. **Task 23 — Auth/session and audit closure:** complete. Route authorization,
   direct AuthContext, weighted/scoped session-link behavior, and actor-bound
   atomic schedule/member-addition audits have executable coverage.
2. **Task 24 — Slack production closure:** complete. Secure pairing and real
   unlink, an actionable `/healthcheck`, availability and delivery-window
   eligibility, member-visible interaction replies, closing reminders, a
   persistent retry queue that actually drains, and a redacted
   disposable-workspace acceptance pass on 2026-08-26.
3. **Task 25 — Automated/deployment evidence:** complete. Isolated seeded E2E
   database, TEST_MODE capture that fails rather than skips, a real browser
   journey with no cookie injection, axe across seven states, corrected MSW
   identity contract, executable libSQL repository evidence, and CI that runs on
   feature branches and fails on any skipped test.
4. **Task 26 — Reconciliation and merge:** in progress. Synchronize
   requirements/design/tasks/README/AI_CONTEXT, run the full local gate set,
   then merge through a green pull request before branching new work.

Task 20.1 is closed by supersession: `e2e/happy-path.spec.ts` was deleted and
replaced by `e2e/journey.spec.ts` under Task 25.2. Task 21's final verification
is carried out as Task 26.2 rather than separately.

### Commit boundaries from Task 23 onward

The browser-acceptance checkpoint is a one-off consolidation exception. After
it, commit each green testable behavior before starting the next. Task 23 is
expected to land as these independent conventional commits (split further if a
slice stops being reviewable):

1. `fix: invalidate authenticated sessions on logout` — Task 23.1 complete in this checkpoint.
2. `fix: authenticate team collection routes` — `/api/teams` GET/POST portion of Task 23.2 complete in this checkpoint.
3. `fix: authorize team data exports` — export portion of Task 23.2 complete in this checkpoint.
4. `fix: protect session detail reads` — session-detail GET portion of Task 23.2 complete in this checkpoint.
5. `fix: replace participation header authentication` — participation and URL ownership portion of Task 23.2 complete in this checkpoint.
6. `docs: make direct auth context authoritative` — requirements/design plus contract regression for Task 23.3 complete in this checkpoint.
7. `feat: select weighted micro-pulse questions` — first half of Task 23.4 complete in this checkpoint.
8. `fix: scope reused session-link authentication` — second half of Task 23.4 complete in this checkpoint.
9. `fix: audit schedule configuration changes` — first half of Task 23.5 complete in this checkpoint.
10. `fix: audit team member additions` — second half of Task 23.5 complete in this checkpoint.
11. `fix: secure slack account linking and unlinking` — Task 24.1 complete in this checkpoint.
12. `feat: prompt on-demand health check from slack` — first half of Task 24.2 complete in this checkpoint.
13. `fix: gate slack prompts by availability and delivery window` — second half of Task 24.2 complete in this checkpoint.

Each slice includes its red/green tests, required README and AI_CONTEXT updates,
and targeted validation. Do not wait for all of Task 23/24 to commit or leave a
green slice uncommitted while beginning the next one.

Current known blockers are implementation gaps, not merely missing manual proof:
the interaction queue has no Prisma implementation and is instantiated fresh
per scheduler tick, so it is never actually drained; required Playwright tests
can skip through a nonexistent token endpoint and use
unseeded/non-isolated data; the response MSW body remains stale; Turso selection
lacks repository execution evidence.

Explicitly deferred non-blockers: session lifecycle management UI; dashboard
chart/Latest Session/question-disclosure UX; `app_mention`/`message.im` behavior
if those subscriptions remain undocumented; broader design-system, navigation,
CSRF, generalized rate-limiting, performance, and telemetry work.

### Slack workspace acceptance — completed 2026-08-26 (Task 24.5)

A full disposable-workspace pass ran against a real Slack app over an ngrok
tunnel, using a disposable team seeded alongside the accepted browser-acceptance
data. All nine script items passed; the detailed evidence table lives in
`.kiro/specs/integration-hardening/tasks.md` under Task 24.5. Do not repeat this
pass unless Slack behavior changes.

Three defects were found that the 1,150-test suite could not see, because each
only manifests outside the app:

1. Pages served over a tunnel host hung on "Loading" — Next.js blocks
   cross-origin dev assets, so React never hydrated. Fixed by `allowedDevOrigins`
   in `next.config.ts` (development-only).
2. Slack link unfurls showed "App" and "Generated from nextjs-fullstack-starter";
   Task 17.1 renamed `package.json` but left `src/app/layout.tsx` on template
   defaults. Fixed, with a regression test over the exported metadata.
3. The closing reminder was byte-identical to an opening prompt, leaving
   Requirement 13.4 unimplemented. Fixed as Task 24.5a.

Teardown removed the disposable team and every dependent row; the accepted data
was verified unchanged afterwards at 1 team / 1 member / 2 sessions /
10 responses / 10 aggregates. `.env` was restored to localhost with the reserved
ngrok domain kept as a commented line. No tokens or pairing codes were recorded.

### Slack message rendering — verified 2026-08-24

The `/healthcheck` payloads produced by `buildPromptMessage` were pasted into
Slack's Block Kit Builder and render correctly: bold `mrkdwn` headers and question
titles, a working `<url|label>` browser-fallback link, the italic away note in a
context block, and acceptable density with five question groups (12 blocks, well
under Slack's 50-block limit). Message construction is therefore de-risked without
a workspace; what remains unproven is `action_id`/`value` round-tripping and the
ephemeral response wrapper, both of which need Task 24.5. Do not repeat this
Block Kit check unless `buildPromptMessage` changes.

### Task 25 — automated evidence (completed 2026-08-26)

- **Database isolation (25.1):** `resolveSqliteFileUrl` is shared by the runtime
  and `prisma.config.ts`, so the CLI and app cannot target different files.
  Writing the test proved the old defect live — a stray team landed in
  `prisma/dev.db` despite `DATABASE_URL` pointing elsewhere; it was removed and
  the accepted data verified intact. `e2e/global-setup.ts` provisions
  `prisma/e2e.db` per run (wipe, migrate, seed) and refuses to run against
  `dev.db`. Node 24 will not spawn Windows `.cmd` shims without a shell, so the
  setup seeds in process and runs the Prisma CLI entry point under the current
  Node binary.
- **TEST_MODE capture (25.1):** magic-link tokens are captured in process and
  read through `/api/test/magic-link`, replacing a token endpoint that never
  existed and let required scenarios skip. Inert unless `TEST_MODE=true`;
  returns a bare 404 otherwise, even when a token for that address is in memory.
- **Real browser journey (25.2):** eleven serial stages — login, genesis,
  settings, member addition, two full feedback lifecycles, close, materialise,
  dashboard transition. One shared page carries a server-set cookie; no
  `addCookies` anywhere. Values are cross-checked against the database.
- **Accessibility (25.3):** axe across all seven states plus the expanded
  drill-down. Found and fixed real WCAG AA contrast failures: `text-gray-400`
  at 2.48–2.6, `bg-green-600` at 3.21, `text-green-600` at 3.21.
- **MSW contract (25.4):** the response mock no longer requires a body
  `memberId` the real route ignores; the session page no longer sends one.
- **CI (25.6):** runs on pushes to any branch with a concurrency group,
  provisions its own database, uploads traces on failure, and fails on any
  skipped test via `e2e/no-skips-reporter.ts` — verified by a temporary probe
  that exits 1 when a test skips and 0 otherwise.

Known weakness recorded rather than hidden: the drill-down detail region is
located by CSS class because the disclosure has no `aria-controls`. Adding it is
item 3 on the deferred dashboard UX list and would give a durable handle.

### Changes and validation already completed

- Failed Slack deliveries now survive the request that produced them. A Prisma
  `InteractionQueueRepository` is registered in `Repositories`, and the tick route
  no longer constructs a request-local `InMemoryInteractionQueueRepository` whose
  contents were discarded when the request ended. Entries carry a replayable
  `QueuedDelivery` descriptor (`src/lib/slack/queued-delivery.ts`): a `dm` stores
  the resolved Slack user plus built blocks, a `response_url` stores the URL and
  text, because the retry runs in a process with none of the original context.
  `createQueuedDeliveryDispatcher` picks the transport per entry; the tick drains
  due entries through the existing `createInteractionQueue` backoff (30s/2m/8m/20m,
  5 attempts, then permanently failed). An undecodable entry returns false and
  terminates through the same backoff rather than failing on first sight.
- Closing reminders are now dispatched. `SessionService.open` stores
  `scheduledOpenAt`/`scheduledCloseAt` from the team schedule via
  `nextOccurrenceUtc` (DST-safe: calendar arithmetic on date components, wall-clock
  conversion through `fromZonedTime`), which the design already specified but the
  code never did. `NotificationService.sendDueClosingReminders` reminds every
  eligible member once `now` is inside the lead window and before the close;
  the lead time defaults to 24 hours and is configurable through
  `CLOSING_REMINDER_LEAD_HOURS`. The scheduler tick calls it for every open session.
  Duplicate delivery is prevented by a new `NotificationDelivery` table with a
  unique index on `(memberId, sessionId, type)`; the Prisma claim relies on that
  constraint rather than a read-then-write, so racing ticks cannot both send, and
  the in-memory fake mirrors first-caller-wins. The claim is taken only after every
  eligibility gate, so an ineligible member keeps their slot for a later tick.
- `sendMidSessionNudge` now honors `remindersEnabled`, weekly-only cadence
  (micro-pulse members are prompted daily anyway), current availability, and
  availability during the previous session (Original 13.1, 13.6, 13.7). Its
  once-per-session guard moved from the in-process Map — which could not survive a
  serverless invocation boundary — to the same durable `NotificationDelivery` claim.
- The scheduler tick route is now driven directly by its tests through
  `_setTickTestDeps` (recording sink plus fixed clock), replacing tests that
  reproduced the route's orchestration inline and therefore never exercised the
  route's own wiring.
- `/api/slack/interactions` now replies to the member instead of acking silently.
  A stored score returns a confirmation naming the question and score (5.8), an
  out-of-range or malformed score returns a validation error naming the affected
  question (5.7), a click with no open session returns a session-ended rejection
  (5.9), and an unlinked Slack user is pointed at `/healthcheck connect`. Replies
  go through the payload's `response_url` via `createInteractionResponder`
  (`src/lib/slack/interaction-response.ts`) because ephemeral prompts cannot be
  updated with `chat.update`. `replace_original: false` keeps the prompt and its
  buttons in place so 5.10 updates still work. The sender makes a single attempt
  and never throws: the 3-second ack is returned regardless of reply failure, and
  durable retry of exhausted replies stays Task 24.4. Route tests inject the
  responder through `_setInteractionResponder`, so no test performs real network I/O.
- `NotificationService.sendSlackPrompt` now owns bot-initiated prompt eligibility:
  Slack link, active-away check, and the team's configured Slack delivery window
  evaluated in the team timezone (inclusive boundaries, midnight-spanning windows
  supported, unconfigured window unrestricted). The scheduler tick no longer
  filters availability itself, and the service takes an injectable clock.
  `getLocalDayAndTime` moved to `src/lib/local-time.ts` alongside
  `isWithinTimeWindow`, so scheduling and delivery windows share one
  timezone-aware implementation. `remindersEnabled` deliberately does not gate
  opening prompts — it governs closing reminders and nudges (Original 13.1).
- `/healthcheck` now resolves through `HealthCheckPromptService`, which owns Slack
  identity resolution, open-session lookup, outstanding-question calculation, and
  session-link reuse (minting one only when the session opened without it). Weekly
  members receive every outstanding question; micro-pulse members receive the
  weighted subset from `QuestionSelectionService`. The route returns interactive
  score blocks plus the browser fallback link, or an ephemeral message for
  unlinked, no-active-session, and fully-answered cases. Accepted contract: an
  explicit command is never refused for away/reminders-off/outside-window state —
  those gates govern bot-initiated sends only — and an away member is prompted
  with an advisory note.
- Team-member addition now passes the authenticated Delivery Manager actor into
  `TeamService`, builds one stable summary for both the response and exact
  `member_added` audit payload, and atomically persists the member, default role,
  and audit. Prisma uses a transaction; the in-memory fake proves audit failure
  rolls the aggregate back. Property coverage checks arbitrary names, emails,
  and actors.
- Schedule configuration now passes the authenticated Delivery Manager actor into
  `ScheduleService`, emits one `schedule_change` audit with stable complete
  normalized snapshots, uses `"null"` for first configuration, and skips both
  persistence and audit for normalized no-ops. Schedule, canonical Team timezone,
  and the audit append now commit through one repository aggregate operation;
  the fake mirrors timezone state and proves audit failure leaves schedule state
  unchanged. Property 24 exercises arbitrary schedules and actors.
- Session-link authentication now uses one service-owned expiry bound for both
  persistence and cookie emission: the earliest of health-check close, an
  existing UserSession expiry, or seven days. Reused sessions are atomically
  shortened and never extended; elapsed bounds persist immediate expiry and emit
  non-negative `Max-Age=0`. Property 12 now executes this contract across
  generated new/reused and close/no-close cases.
- Session-link responses now use `QuestionSelectionService` for micro-pulse
  members; the service owns cadence, injected-clock remaining-day, weighting,
  and bundling policy. The API returns `allQuestions` and `expandable`; the UI
  preserves complete response state while rendering the selected subset, can
  submit newly expanded questions without another fetch, and handles an
  all-answered selection. Weekly behavior remains the full question set.
- Requirements and design now define `AuthContext.memberId` as the sole
  authoritative protected-browser identity and prohibit trusting or synthesizing
  identity headers. Magic-link tokens, session-link tokens, genesis tokens,
  verified Slack signatures, and scheduler `CRON_SECRET` are the explicit
  alternate-credential exemptions; an executable contract test scans normative
  and synchronized docs plus all non-test production TypeScript sources.
- Participation GET now authenticates exclusively from the persisted session
  cookie, ignores `x-user-id`, authorizes requested-team membership, and delegates
  privacy-aware counts to `ParticipationService`. Missing/cross-team sessions
  share the same 404; foreign/nonexistent URL teams share the same 403; no score
  or trend detail is returned.
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
- **Suite flake (2026-08-25) — probably explained on 2026-08-28.** One full run
  reported a single failure that did not reproduce, and the failing test's
  identity was lost to truncated output. The scheduler tick was later found to
  run on two clocks: it reconciled against its injected clock but stamped
  `scheduledCloseAt` from the wall clock, so the closing-reminder tests passed
  or failed according to whether the run happened before or after Friday 17:00
  UTC. Fixed in `7648e21`; the tick now builds its own session service bound to
  the tick instant. Treat the 2026-08-25 flake as likely the same defect, but
  it was never confirmed.
- **Two further flakes, both identified and fixed on 2026-08-29.** An earlier
  note here speculated about a day-boundary effect; that was wrong, and neither
  cause was time-of-day related.

  1. **Fixed timing tolerances in `session-link/[token]/route.test.ts`.** CI
     failed a *docs-only* commit with `expected 1001 to be less than or equal to
     1000`. The route sets `expiresAt` inside `establishSessionLinkAuth` and
     computes `Max-Age` from a later `Date.now()`, so any pause between the two
     shortens `Max-Age`. Three assertions compared the drift against constants,
     which is a claim about how fast the machine is, not about the code. They
     now bound by the measured request window: the cap is asserted exactly
     (the security-relevant direction), the lower bound allows for however long
     the request took. `expectCappedMaxAge` and `expectCookieAndRowAgree` in
     that file are the shared helpers.
  2. **Substring collisions in `csv-export.property.test.ts` Property 19.** The
     leak check searches the whole CSV for each generated member name. A name of
     `e C` lives inside `Response Count` in the header, so fast-check eventually
     generated one and reported a leak that had not happened. `ing` inside
     `q-delivering-value` would have done the same. Names that are part of the
     export's own fixed text are now excluded, which leaves the property at full
     strength.

  **Lesson worth keeping:** both were found only because a run's full output was
  captured rather than filtered to a summary line. When a flake appears, capture
  the failure block *before* re-running — the identity is the whole difficulty,
  and a lost occurrence costs days of guessing.
- Latest validation: **147 Vitest files / 1193 tests, plus 27 Playwright tests with zero skips, all passed**,
  `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`
  all passed.
- Temporary local execution scripts were deleted. The approved consolidation
  checkpoint preserves the accepted fixes; Task 23 is fully reconciled,
  and Tasks 24.1 (secure Slack account linking/unlinking) and 24.2 (Slack
  command/prompt eligibility) are complete. Resume with Task 24.3 (closing
  reminders dispatched from scheduler ticks).

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

The Vitest suite now contains **1789 tests across 187 files**, including
queued-delivery descriptor encode/decode, Prisma retry-queue persistence against
a stubbed client, per-transport replay dispatch, and route-level drain coverage
(replay, backoff, and exhausted-retry termination),
route-level scheduler-tick coverage that drives the exported POST handler
(cron auth, session opening, prompt eligibility, lead-window reminders, and
no repeat reminders across ticks), mid-session nudge eligibility,
DST-safe next-occurrence resolution, stored scheduled open/close windows,
closing-reminder eligibility with durable once-per-session claims, and
lead-window dispatch with a configurable lead time,
Slack interaction reply coverage for confirmations, score rejections,
session-ended and unlinked cases, missing `response_url`, and reply failure
preserving the ack, plus response_url transport tests over an injected fetch,
bot-initiated prompt eligibility coverage for away members, delivery-window
boundaries, team-timezone evaluation, and midnight-spanning windows,
on-demand `/healthcheck` service and route coverage for unlinked users,
missing sessions, weekly and micro-pulse selection, session-link reuse/creation,
fully-answered members, and away advisory notes,
cookie-authenticated Slack pairing/unlink/persisted-status coverage across
routes and the `/me` page pairing-code UI, actor-bound `member_added`
route/service/property coverage with exact stable summary serialization and
member/default-role/audit rollback parity,
schedule-change audit route/service/Property 24 coverage, atomic failure rollback,
and Prisma/fake canonical timezone persistence,
session-link Property 12 coverage for persisted monotonic close/existing/seven-day expiry and non-negative cookies,
weighted micro-pulse API/property/UI expansion coverage, an executable direct-AuthContext documentation/source contract, cookie-only,
team/session-bound participation with privacy-safe payloads,
cookie-authenticated, team-bound session-detail reads with non-leaking failures,
requested-team-scoped CSV exports, persisted logout/session-cookie clearing,
member-summary contracts, member
mutation authorization/final-manager protection, optional trend toggles,
authenticated complete-pair delivery-window audit/validation, cookie-auth
session close/team binding, and closed-link initial-render regressions.

---

## CI Pipeline (GitHub Actions)

**`ci`:** Install → Prisma generate → Lint → Type Check → Unit+Property Tests → Build
**`audit`:** `npm audit --omit=dev --audit-level=high`, in parallel with `ci`
**`e2e`:** Install → Build → Playwright E2E Tests (depends on `ci`)
**`requirement-coverage`:** PR description check, on pull requests, not for Dependabot

**The audit runs as a job of its own (2026-09-12).** It used to be the first
step of `ci`, so a newly disclosed advisory in an unchanged dependency skipped
Lint, Type check, Run tests and Build, and took `e2e` with it — CI then
reported nothing at all about the code under review. That happened on PR #20,
for a MySQL driver this app never loads. A supply-chain advisory and a broken
change are different failures; neither should silence the other.

**`requirement-coverage` is skipped for Dependabot.** It greps the PR body for
`Requirement N.N`, which a bot never writes and has no honest one to write.
Auto-filling a number was considered and rejected: the gate would then report
coverage nobody claimed. Note what the check can and cannot do — commit
`25fcce6` is tagged `NFR 2.1`, which is *Accessibility*, for a change pinning a
MySQL driver, and the gate accepted it. It greps for a shape, not a truth: a
prompt to think, never proof that anyone did.

**`master` is protected as of 2026-09-12.** Until that day nothing enforced a
green run before a merge — this file claimed otherwise and was wrong, and the
discipline had already slipped once, when PR #9 was merged with Requirement
Coverage failing. Four checks are now required:

- `Lint, Type Check, Test, Build`
- `Audit Production Dependencies`
- `Playwright E2E Tests`
- `Analyze (javascript-typescript)` (CodeQL)

`Requirement Coverage Check` is deliberately **not** required, because it is
skipped for Dependabot. A required check that never reports can leave a pull
request unmergeable, and deadlocking every dependency bump to enforce a grep
for a text pattern is a poor trade. It still runs and is still visible; it is
a prompt, and prompts do not need teeth.

`strict` is on, so a branch must be up to date with `master` before merging.
That is the setting that would have caught `e2e/sign-in.ts` — a helper every
spec depends on, left stale by a change on another branch.

Force pushes and deletions are blocked, and conversation resolution is
required. `enforce_admins` is **off**: this is a single-maintainer repository,
and locking the only admin out of an emergency fix protects nothing. It is the
setting to revisit first if anyone else gains write access.

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

### Closed spec: `.kiro/specs/integration-hardening/`
- `requirements.md` — 13 requirements covering auth/cookie foundation, session-link enrichment, response submission, protected routes, notification wiring, Slack identity, Turso production DB, E2E tests, MSW alignment, and repo hygiene
- `design.md` — Integration architecture, 12 correctness properties, direct-AuthContext auth design, cookie scoping, notification sink pattern
- `tasks.md` — Tasks 1–21 record the original pass, Task 22 records completed acceptance regressions, Tasks 23–26 covered auth/session, Slack, automated evidence, and final merge closure
- Complete: merged to `master` as `7eba5f6` on 2026-08-26

### Open spec: `.kiro/specs/manager-experience/` (written 2026-08-28)
- `requirements.md` — 5 requirements plus 2 NFRs: shared navigation, session lifecycle control, dashboard comprehension, first-run guidance, ambiguous-identity guard
- `design.md` — 9 key decisions, 6 correctness properties, per-tier testing strategy, explicit out-of-scope list
- `tasks.md` — 9 task groups across 5 phases with three checkpoints; phase 5 (the identity guard) may be pulled forward if a colleague hits the conflict first
- **Scope decision (2026-08-28):** multi-team membership is *not* in scope. `TeamMember` is unique on `(teamId, name, email)`, so one email can exist in several teams, while `auth.service.ts:158` resolves it with `findFirst` — an arbitrary row. The agreed approach is to guard and document: reject the member addition that would create the collision, refuse to issue a magic link for an already-ambiguous email, and state the one-team constraint in the README. Proper multi-team support needs an identity model above `TeamMember` and is its own future spec

---

## Auth Architecture (Post-Integration-Hardening)

- **Cookie-based sessions**: Magic link verification, genesis completion, and session-link validation set the `session` httpOnly cookie
- **Persisted logout**: `POST /api/auth/logout` deletes only the presented UserSession token and returns an idempotent 204 with the environment-aware clear-cookie header
- **Authenticated team collection**: `/api/teams` GET is member-scoped; POST uses only cookie AuthContext for creator/member/role/audit identity and atomically returns 409 for concurrent or sequential second-team attempts without partial persistence
- **New-user genesis claim ownership**: Magic-link verification reads and validates unused/unexpired `PendingGenesis` records without mutation; genesis execution performs the only CAS claim, persists validated team name/description, and establishes the browser session
- **`getAuthContext`**: Factory function (`createGetAuthContext`) extracts + validates the session cookie against UserSessionRepository; its `AuthContext.memberId` is authoritative and identity headers are never trusted or synthesized
- **Intentional alternate-credential routes**: Magic-link tokens, session-link tokens, genesis tokens, verified Slack signatures, and scheduler `CRON_SECRET` entry points validate their named credential rather than browser cookie auth
- **`withAuth`**: Factory-created HOF wrapper that enforces auth on route handlers (401 if invalid)
- **`authorizeTeamMember`**: Factory function verifying member belongs to requested team (403 if not)
- **`authorizeDeliveryManager`**: Extends team membership check with delivery_manager role requirement
- **Protected routes**: `/api/me/*`, `/api/teams` GET/POST, team exports, session details, participation, responses, and core team settings/trends/member/session routes use cookie AuthContext with requested-resource ownership checks; Task 23.2 route authorization is complete
- **Member management**: GET/POST/PATCH return a stable member-summary DTO; Delivery Manager additions serialize that exact DTO into an actor-bound `member_added` audit and atomically persist member/default-role/audit; role replacement and removal retain final-manager protection
- **One team per person, enforced in services not schema**: `TeamMember` is unique on `(teamId, name, email)`, so the database accepts one email in several teams — `src/tests/integration/shared-email.test.ts` proves it against a real file. Sign-in cannot resolve that, so `team.service.addMember` rejects an email held by another team before writing anything, and `auth.service.requestMagicLink` issues no token for an email matching more than one member, logging the email and team ids. `requestMagicLink` still returns void for every input, so anti-enumeration is unaffected. `findAllByEmail` exists for callers that must see *all* matches; `findByEmail` returns an arbitrary one and is unsafe for identity resolution. Multi-team membership remains a future spec
- **Audit log response shape**: `GET /api/teams/[teamId]/audit-log` returns `{ entries, nextCursor }`, not a bare array. It returned an array until 2026-08-29, while the page destructured `data.entries` — which on an array is `Array.prototype.entries`, a *function*. React's `setState` treats a function argument as an updater and called it unbound, throwing `Cannot convert undefined or null to object` at the `useState` line. The route test asserted `Array.isArray(body)` and the page's MSW mock returned `{ entries, nextCursor }`: both green, flatly contradicting each other, because no test crossed the boundary. `e2e/navigation.spec.ts` now follows the nav link and asserts a seeded entry renders
- **Session context for the shell**: `GET /api/me` returns `team: { id, name } | null` and `roles: string[]` alongside the member profile, resolved through `repos.team.findById` and `repos.teamMemberRole.findByMemberAndTeam`. The navigation shell reads these to build team-scoped links and to omit Delivery-Manager-only destinations rather than rendering links that 403. `team` is null only when the team record cannot be resolved, which the Prisma foreign key makes unreachable in production
- **Slack identity**: Pairing derives memberId from AuthContext (never the request body) and `createContainer` wires `slackIdentityLinkRepo` into `AuthService`, so a verified code persists/upserts the link. `DELETE /api/me/slack-link` deletes the record before reporting success, and `GET /api/me` returns the persisted `slackLink`, so status survives reload/restart. The `/me` page's `SlackSection` has a pairing-code input for the unlinked state. Task 24.1 is complete
- **On-demand prompts**: `/healthcheck` delegates to `HealthCheckPromptService`, which resolves the linked member, the team's open session, the outstanding questions for their cadence preference, and a reused-or-minted session link; the route returns interactive score blocks with a browser fallback. An explicit command is never refused for away/reminders-off/outside-window state
- **Notification wiring**: Newly-opened prompts reach NotificationService and the production Slack sink, which now gates delivery on Slack link, availability, and the team's delivery window in the team timezone; closing reminders, persistent retry storage, and later-tick draining remain Task 24 blockers
- **Turso**: Environment-aware Prisma client selection, now with execution evidence. Task 25.5 found the production path was broken — `PrismaLibSql` takes the libSQL *config* and builds its own client, but `prisma.ts` passed an already-constructed client, so `config.url` was undefined and every query would have failed with `URL_INVALID`. Fixed, and covered by `src/tests/integration/libsql-repository.test.ts`, which runs real repository work through the adapter against a local file (no Turso account needed)

---

## Hooks

- `requirement-traceability` (postTaskExecution) — reminds agent to tag Requirement IDs in source files and commit messages after each task

---

## Outstanding Work

### Explaining itself — phase 1 in progress (2026-09-14)

`.kiro/specs/explaining-itself/`. Five findings from Matt walking the whole
loop on production. Everything worked; almost nothing explained itself.

**Three silences render identically** — **phase 1, done.** A closed check shows
no scores because materialisation runs on the next tick (resolves in minutes),
or because one response is below the anonymity threshold (never resolves), or
because nobody answered.

The spec assumed the distinction was already in the data. **It was not.** "Not
computed yet" and "computed, and nobody answered" were the same absence — zero
aggregates — and the only thing left to separate them was elapsed time. Guessing
from the clock fails in the dangerous direction: a stalled scheduler would have
the dashboard report that a team ignored a health check it was never asked
about. So `HealthCheckSession.materialisedAt` was added first, written by
`materializeAggregates` after the aggregates land, and a fourth state —
*overdue* — falls out of it. That is the one message that would have surfaced a
stopped cron to the person who could restart it.

`result-state.ts` holds the whole rule as a pure selector plus the wording:

- `resultState()` returns `shown` / `pending` / `overdue` / `suppressed` /
  `unanswered`. A value that exists is decided first, which is what stops a
  theme reporting pending and suppressed at once.
- `materialisationEvidence()` covers sessions closed before the column existed,
  where a single aggregate is itself proof the work ran. Without it every
  unanswered theme in production’s existing sessions would have claimed the
  scheduler had stopped.
- `describeResultState()` owns the words. The latest-session panel and the
  question themes list describe the same session and a reader moves straight
  between them; they had two wordings for suppression, and "Insufficient data"
  read as a fault in the data when the truth was a small team. Both now say
  *Hidden until 3 people have answered*.

**And the panels were unreachable for the team most likely to need them.** The
trends route withheld *sessions* whenever fewer than two had closed, so a team
that had closed exactly one check was told "more data needed" — a statement
about the chart — and shown no scores at all. That is what Matt saw on
production after closing the first check. A trend needs two points; a result
needs one. The route now returns the closed sessions either way and
`requiresMoreData` keeps its original meaning, while the page gates only the
chart on it. Proven in a browser: a seeded single-close team shows its scores,
and a seeded team whose closes were never materialised reports *overdue* on
both surfaces rather than accusing anyone of silence.

Each of the four states is axe-audited on both surfaces, proven live by
mutation rather than assumed — an audit of a state the page never entered
reports a pass for work it did not do, which is how the amber contrast defect
survived.

**Submitting has no ending** — **phase 2, done.**

The confirmation is a live region above the form rather than a receipt
replacing it, the control reads *Update responses* once answers exist, and a
repeat submission is named as one — `answersMatch` compares what was sent
against what the page believes is saved, so an answer changed and changed back
counts as no change, which a dirty flag would have got wrong. The request goes
out either way: it is idempotent, and skipping it would strand a member whose
first attempt failed.

**A premise in the spec was wrong, and only a browser found it.** The design
said a member on a session link alone may be signed in to nothing, so the way
onward had to work for two audiences. In fact
`/api/auth/session-link/[token]` establishes a session for that member until
the check closes — opening the link signs you in — so there is only one
audience. The guard on the link stays for the cases that are real (cookies
refused, session expired at close), and the E2E now asserts what is true: a
member holding only a link reaches `/me/health-check` and the navigation shell
from the confirmation.

Two test defects were found in the same run, both of the kind that report
success for work not done: `locator.all()` does not wait, so a loop over it
before the form rendered clicked nothing while claiming to have answered
everything; and the first version of the two-audiences test passed by racing
the `/api/me` request it should have waited for. `seedTeam` also could not
reseed a team that had a session — the Team delete failed a foreign key, on
the retry that follows a first failure, turning one readable error into two.

The original finding, for the record:

**Submitting had no ending.** No confirmation, no way onward, and a button
reading exactly as before anything was saved — so pressing it again looks like
submitting twice. Decided: confirm and keep the form, because the tool allows
revision until close and a member who thinks answers are final answers more
cautiously. A redirect was rejected: someone on a session link alone may have
nowhere to be sent.

**Phase 4 is done, and it found a real authorisation defect.**

`removeAway(availabilityId)` deleted whatever the id named, and
`DELETE /api/me/availability` passed one straight from the request body. Any
signed-in member could cancel any other member's away period given its id, and
the member who lost it would be prompted through a holiday with nothing on the
page to say why. The service now takes the member id and refuses anything that
is not theirs; the route passes `auth.memberId`. A property test, three route
tests, and a mutation check that removes the guard and watches five fail.

A period belonging to somebody else returns exactly what an invented id
returns — same status, same body, nothing thrown. A distinct error would
confirm that the id names a real period belonging to someone, and idempotent
cancelling was wanted anyway.

**Availability could be set and then never seen again.** `getAvailability` has
been on the service since availability was built and no route ever called it,
so the page took two dates, said "Away period saved" and forgot them.
`GET /api/me/availability` exists now; the page shows the dates, says plainly
when none is set, and shows a period it just created rather than announcing
that something was saved.

Note the MSW default handler that came with it. Without one the new fetch hit
`onUnhandledRequest: "error"` and the component's catch swallowed it — every
other profile test would have passed against a request that never worked.

**Phase 4.1 is done: the profile says what its settings do.** Four controls —
cadence, reminders, availability, Slack — and not one of them said what it
affected. "Weekly" and "Micro-Pulse" were two words to choose between with
nothing to choose on.

The reminders toggle was the expensive one, because the code agrees with the
member's wrong assumption: `sendSlackPrompt` never reads `remindersEnabled`,
only `sendClosingReminder` and `sendMidSessionNudge` do. Turn reminders off and
you are still prompted when a check opens. Saying so beat the alternatives —
changing what the toggle governs would let a member silence the one prompt that
starts a check.

Availability was the other surprise: being away gates notifications and nothing
else. No response path consults it, so a member who marks themselves away can
still answer a check that is open, and now the page says that.

Every explanation is tied to its control with `aria-describedby`, and a test
follows every reference on the page to real text — an `aria-describedby`
pointing at a missing id is silent, so asserting the attribute alone would pass
while a screen reader heard nothing. The "ten minutes" in the Slack copy is
pinned to `PAIRING_CODE_EXPIRY_MS`, which is exported for that reason.

**Phase 3 is done: Settings left a contributor’s navigation.** Every write
behind that page is manager-only, so offering the link to everybody
advertised a page that would refuse them. It is gated on `delivery_manager`
now, the same way the audit log always was.

The dashboard is not gated, deliberately — see below. And the removal is not
a boundary: a browser test signs in as a contributor, types the settings URL,
and asserts they see exactly what they saw before. Navigation is not
authorisation, and conflating the two would leave somebody believing a
missing link was protecting something.

The existing tab-order test did not move, which is worth knowing: every
member the browser suite seeds is a Delivery Manager, so it still tabs
through seven destinations. A contributor’s order is a new test.

**The dashboard stays open to every member** — revised during the discussion,
and rightly. Its data is aggregate and anonymised, and hiding it would make
transparency depend on a role. It already gates the lifecycle panel by role,
with an E2E test proving a contributor sees no open or close controls.
**Settings is the one that lies**: the nav offers it to everyone while every
write behind it is manager-only. Navigation is not authorisation and this does
not pretend otherwise — Requirement 3.4 freezes route behaviour deliberately.

**Four profile settings with no explanation**, and the reminders toggle needs
care: it governs closing reminders and nudges, *not* opening prompts and not
sign-in. Someone turning it off expecting silence will still be prompted.

**An away period can be set and then neither seen nor cancelled** — a setting
that changes behaviour invisibly and, from the member’s view, permanently.

The privacy defect found in the same session — trend indicators bypassing the
anonymity threshold — was fixed immediately and is out of scope here.

## Outstanding Work

### Knowing what happened — built 2026-09-16

`.kiro/specs/knowing-what-happened/`. The application keeps no record of what
it does. Eleven `console` calls exist in the whole codebase, all but one in a
catch block, and the scheduler tick — which opens checks, closes them, computes
results and sends every prompt — logs nothing and returns `{ ok: true }`
whatever it did.

**The cost is already paid.** The dashboard says "Results are overdue — the
scheduler may not be running" because a stalled scheduler is indistinguishable
from a silent team *from the outside*, and there was no inside to look at. That
message is a user interface compensating for an absent record, and the
deployment spec’s open task "establish how a stopped trigger would be noticed"
is the same gap from the other side.

The five lines that do exist say things like `Slack delivery failed after 3
attempts: Error` — not which member, team, session or check.

**Scope: boundaries only**, decided with Matt. An agent can reconstruct what the
code *would* do; nothing can reconstruct what it *did* at 15:30 on a Monday. So
decisions and outcomes at the edges, and no narration of internal steps — that
was always a substitute for reading the code and is now a substitute for
something much cheaper.

One module writing JSON to stdout, no dependency. `docs/operations.md` lists
every event and what to filter on.

**The tick now answers with what it did** —
`{ opened, closed, materialised, prompts, durationMs, tickId }` — because
cron-job.org shows the response body and that is the one dashboard anybody
looks at. And it says *why* it did nothing: `no schedule configured`, `team
archived`, `outside the collection window`, `this cycle has already been
served`, `a check is already collecting`. Five different silences that all
looked identical from outside, which is the reason the dashboard has an
"overdue" state at all.

**Then the counts were read on the real dashboard, and they were not enough.**
The response was `{ opened: 0, closed: 0, materialised: 2, prompts: 3 }`, and
the verdict was that it needed "a reminder of what it’s telling me". A record
that needs a reminder is not a record anybody reads at a glance — the same
defect the `explaining-itself` milestone exists to remove, arriving in the
milestone meant to fix it.

The counts were never the missing piece. `opened: 0` is the correct outcome on
a Wednesday and a failure on Monday at 15:30, and no number tells them apart.
The reason does — and the reasons were going to a server log nobody reads on a
schedule while the response carried only totals. So the tick now returns its
reasons as well as its counts, and the response leads with a sentence:

> Ran and opened 1 check, prompting 3 members, computed results for 2 checks.

> Ran, nothing was due: 2 teams outside the collection window, 1 team with no
> schedule configured.

Three things are worth knowing about how it is put together
(`src/lib/services/tick-summary.ts`, criterion 1.6, added for this):

- **The facts are the service’s, the sentence is the route’s.** Only the route
  knows how many prompts went out, so only the route can compose the line.
- **Counting happens where recording happens.** `skip()` inside the tick writes
  the record and increments the count in one place, so a reason cannot be
  logged without also reaching the response. A test compares the two sets.
- **`SKIP_REASONS` is a shared const union** (`tick-reasons.ts`) with a phrase
  per reason for reading after a count. The first version composed
  `${count} ${reason}` and produced "Passed over 2 a check is already
  collecting." A new reason without a phrase is now a compile error.

"Computed results for", never "materialised": the word is ours, and the reader
is whoever has the cron dashboard open. `docs/operations.md` shows both shapes.

**And then the premise turned out to be conditional.** Criterion 1.4 said the
summary belongs in the response "since the cron service that calls it shows the
response". cron-job.org does not, by default — it shows `200 OK` and nothing
else until the job has **save responses** switched on, and then keeps headers
and bodies for the last 50 executions over two days. Reported 2026-09-16 by the
only person who had actually looked at the dashboard.

The criterion survives, reworded: the response is the one artefact the tick
controls, and a server log nobody reads on a schedule is not an answer. What
does not survive is treating a third party's default as a premise. Enabling the
setting is a deployment step now (`docs/deployment.md`), and at a tick every few
minutes fifty executions is about two hours — enough for "what did it just do?",
useless for "what happened on Monday", which is the question this milestone is
named after.

**Email can carry a prompt now** (`reaching-your-health-check` phases 1–2).
Before this, `EmailService` had exactly one method and the tick called
`sendSlackPrompt` and nothing else — so a team without Slack was never told a
check had opened. Email was the only way *in* and Slack the only way to hear
there was anything to do: two single points of failure pointing in opposite
directions.

- `sendHealthCheckPrompt` is a **second method, not a `type` flag**, so the
  templates cannot drift into being the same one. The in-memory fake keeps them
  in separate lists for the same reason: one list would let a test assert "an
  email was sent" and pass when the wrong one was, which is the exact shape of
  the reminder defect this project already shipped once.
- `promptByEveryChannel` attempts both independently. **One failing does not
  stop the other** — a Resend outage that stopped Slack prompts would be worse
  than having no email at all — and each failure is recorded with ids only,
  never the address or the session token.
- The **away and delivery-window gates apply to email**. Somebody who marked
  themselves away did so to stop being prompted, not to stop being prompted *in
  Slack*, and a new channel ignoring that would quietly redefine the setting.
- Idempotency is claimed under its **own** type. Sharing Slack's claim would
  mean a member with Slack never receiving the email, and a member whose Slack
  failed receiving neither.
- The email resolves **that member's own** session link and sends nothing if
  they have none. A session link authenticates whoever holds it.

Phase 1 was already built; the two boxes it had left were real. The panel's
test file had **no axe coverage at all**, and nothing asserted that somebody who
had answered everything could still get back in — mutation-checked by hiding the
link at full participation, which is exactly the "helpful" change that would
have passed.

**The email-prompt preference is nullable, and that is the design**
(`reaching-your-health-check` 3.1). `TeamMember.emailPromptsEnabled` has three
states: on, off, and null for *has not chosen*. The effective answer for null is
derived by `src/lib/services/email-prompt-preference.ts` from whether Slack is
linked — email for a member without it, Slack alone for a member with it.

- A stored default could not serve both Requirement 4.3 (somebody who
  configures nothing still hears about their check) and 5.2 (Slack stays
  primary for anyone who has it). It would have to be chosen when the row is
  written, before anybody knows whether Slack will be linked, and would then be
  wrong for every member who links or unlinks afterwards.
- **Null is not false.** A member who turned email off and a member who never
  touched the control want different things, and nothing downstream can tell
  them apart once a database coerces one into the other. That is proved through
  the libSQL adapter, because Turso is where such a coercion would happen and a
  local SQLite file would prove nothing about it.
- `PATCH /api/me/preferences` therefore treats **null as a value** and only an
  absent key as "leave it alone".
- **Delivery consults it, and this is a reduction in what gets sent.** A member
  with Slack linked and no preference no longer receives an email prompt.
  Phase 2 emailed everybody with an address, which was right for a team with no
  Slack and told everybody else twice. The gate lives inside `sendEmailPrompt`
  rather than in its callers, so no future caller can forget it.
- **The control shows the effective state, not the stored one**
  (`src/app/me/email-prompt-toggle.tsx`). A switch rendered off for somebody who
  is in fact being emailed would be a lie told by a perfectly accessible
  control. When it is following the default it says which default and why,
  because "off because you said so" and "off because Slack can reach you"
  behave differently the moment Slack is unlinked. Touching it always writes a
  boolean: a click cannot have meant "put me back on the default".
- The explanation names what it governs (the prompt when a check opens), what
  it does not ("signing in is never affected: your access links arrive by email
  whatever this says"), and how it differs from Reminders above it — which
  governs *which* messages are sent rather than *how* they arrive.
  Requirement 4.5 exists because "email notifications" alone does not say
  whether sign-in is included, and this application sends its access links by
  email.
- `sign-in-survives-preferences.test.ts` is Property 5, and it was green the
  moment it was written: nothing on the magic-link path reads a preference.
  That is the point — it is an invariant about a path with every reason to grow
  a check later, and adding one fails 3 tests.
- **The known hole is asserted, not implied.** A Slack-linked member who has
  chosen nothing hears nothing when Slack delivery fails, because email
  defaults off for them. That is the stated hole in design decision 3, and the
  fallback needs the retry queue to report outcomes — roadmap, not this phase.
  There is a test asserting the current behaviour so that closing it later is a
  test that changes rather than a surprise found in production.
- Design properties 6 and 7 are new: an explicit choice wins whatever else is
  true, and a member who has chosen nothing always has at least one channel.
  Property 6 exists because the design stated the default and never stated that
  a choice overrode it — an implementation consulting the Slack link first would
  have satisfied every example where the two happen to agree.

Phases 1 to 3 of `reaching-your-health-check` are complete — 43 of its 51
boxes. What is left is phase 4: a contributor walking both surfaces in a
browser, axe in the browser tier, and the production pass (open a check on the
deployed application, answer it with no session link from any message, read the
response back out of Turso, and — once a sending domain is verified — confirm
an email prompt arrives and is not mistaken for a sign-in email).

The channels are documented in README ("How a member hears a check has opened")
and `docs/deployment.md` ("The two ways out"), including the part worth saying
out loud: until 2026-09-18 Slack was the only prompt channel, so a deployment
without it opened checks on schedule and told nobody they existed.

**Slack sign-in works in a real workspace, proved 2026-09-17** against the
hosted app rather than an ngrok tunnel. A linked member signs in; the reply is
ephemeral; a second use of the link fails with "Invalid or expired access link";
and — unlinking first — an account with no binding at all is matched on its
verified Slack email, linked automatically, and signed in.

That last one exercises the two `users:read` scopes, the `users.info` call, the
exact-email match, the automatic link and the sign-in in a single pass. **The
single-use claim is now proved against Turso through Slack**, where before it
had only ever been proved against a JavaScript `Map` and a temporary file.

**And a second one, from Matt reading his own audit log.** It showed two
`slack_binding_matched` entries, each preceded by "Slack user id: None", with
nothing between them saying how the account had become unlinked. Unlinking from
the profile page deleted straight from the repository and wrote no audit entry;
linking with a pairing code did the same. Three of the four ways a binding
changes were recorded and the two a member does for themselves were not — NFR
2.1 half-kept, and a log with a hole in it reads as a log that is complete.

Both are recorded now. `slack_binding_self_linked` for the pairing code, and
the existing `slack_binding_removed` for the unlink: it is the same event as a
manager's removal, and `userId` is what distinguishes who did it, which is what
that field is for.

**The pass found a defect nothing else had.** `slack_binding_matched` had no
label, so an automatic link rendered in the audit log as "Slack binding
matched" — phase 2 named its two change types and phase 3 added a third without
one. Two tests watch for it now, and the second is worth remembering: it
*passed* against the defect it was written for, because `/(binding|…)/i` in
the source had been written to disk with literal backspace characters where the
`` escapes belonged. The pattern required control characters around the word
and could never match. A test that cannot fail reports safety it does not have.

Two acceptance items stay open and are **not reachable in a one-person
workspace**: the guidance an unlinked stranger sees, and what Slack returns for
a guest account. Every account in that workspace matches a member, so the
automatic path always succeeds. Both need a second address.

**Slack sign-in is complete through phase 4.** Email is off the critical path:
production now starts with a Resend key **or** a Slack token, and refuses with
neither rather than accepting an address, saying "check your email" and sending
nothing.

Matt settled the `users:read.email` question, and the record backed him: the
README said `users:read` was removed because *"nothing calls users.info"* — it
went as unused, not unwanted. `/healthcheck signin` is the call that uses it.

- **Phase 3.** An unlinked Slack user is matched to a member by the address
  Slack has already verified. Matching is exact and case-insensitive only
  because an address is; prefix or domain matching would let anybody at the
  same company sign in as a colleague. An address on two teams refuses. Every
  way of failing to match returns the identical answer, so the command cannot
  be used to ask who is on a team. A match never *creates* a member.
- **Phase 4.1.** Removal revokes — and **the fakes disagreed with the
  database**. Prisma deletes the identity link, sessions and magic links inside
  its removal transaction; the in-memory repositories removed the member and
  left them all. So the property could not be proved against fakes, and any
  route test would have passed against a fake *less safe than production*. The
  fakes mirror the transaction now.
- **Phase 4.2.** The startup guard runs after the TEST_MODE check, so the
  graver fault is reported first. Three existing tests had to gain a provider:
  a production environment with only a database URL no longer starts.

The scopes stay optional throughout. Without them a workspace falls back to the
manager-asserted path, and the refusal is recorded as `slack.email.unavailable`
carrying Slack's own error — so `missing_scope` is visible in a log rather than
inferred from members who cannot sign in.

**Phase 5 is the part tests cannot do**: a real workspace. The 2026-08-26 pass
found three defects a 1,150-test suite could not see.

**Slack sign-in phases 1 and 2 are built.** A team can now be set up and sign
in with **no email configured at all**, which is the point the whole spec
exists for: without a verified sending domain Resend delivers to the account
owner and drops everybody else silently, so the tool could not be trialled
unless its owner also owned a domain.

- `/healthcheck signin` replies ephemerally with a sign-in link. The token is
  an ordinary magic link — a second token type would mean a second expiry, a
  second claim, and a second place for single-use to be got wrong.
- A Delivery Manager records a member's Slack id from team settings. They
  assert *who a Slack account belongs to* and gain nothing: authentication
  stays that member's own Slack login, and an ordinary member cannot bind even
  themselves.
- Injectivity is checked before the write. The failure it prevents is a
  mistyped id handing one member the ability to sign in as another.

**The settings page said the opposite and had to be corrected.** "Only they can
do this; it is not something you can set on their behalf" was true until this
existed. A test asserts that sentence is gone — a page contradicting the control
beneath it is worse than a page that says nothing.

**`atomic-claims.test.ts` had been carrying an IOU since it was written**: its
header said real SQLite row-locking tests were owed to "Task 18.x", and they
never were. So single-use — the whole value of a sign-in link — had only ever
been proved against a JavaScript `Map`, where the single thread makes a claim
atomic for free whether or not the database agrees. There is a real-file test
now; removing the `used: false` filter fails it and **not** the in-memory one.

Two test defects worth remembering. A property-style assertion of "some
positive number under an hour" for the retry horizon passed against an
implementation that always returned the full window — the sliding-window
calculation has its own tests under a controlled clock now. And an audit
assertion on `entries()[0]` was flaky by construction, because two entries
written in the same millisecond sort unpredictably.

**The cron dashboard question is closed, 2026-09-16.** `knowing-what-happened`
has no open boxes left. The chain took three corrections, each one from looking
rather than reasoning:

1. The tick returned counts. They satisfied every criterion and could not be
   acted on — `opened: 0` is right on a Wednesday and wrong on Monday at 15:30.
2. The sentence fixed that, and the body was invisible: cron-job.org shows
   `200 OK` until *save responses* is enabled, which criterion 1.4 had assumed
   away.
3. Enabled, the body appeared as one dense string. Indented, it renders across
   lines — confirmed against tick `polp7zlm`, the first run on the deployed
   build.

The indentation was argued for on the grounds that it could not be worse
whichever way their viewer behaved. That turned out to be the right bet and the
wrong reason to need: it renders properly, so the fallback was never used.

**The two tables are live in production, applied 2026-09-16** — and the delay
mattered. `#63` and `#64` merged and deployed before the migration ran, so the
live code spent that window writing to tables that did not exist: caught by
design, recorded as `tick.record.failed`, and invisible because Hobby keeps logs
for an hour. The tick kept working throughout, which is the swallow-and-continue
trade behaving exactly as intended, and nothing was recorded. **Merge and
migrate want to be closer together than that.**

Verified by reading the database back rather than trusting the exit code: both
tables present with the columns the code writes, the `ranAt` index there, the
question catalogue at five, and the existing rows untouched at 1 team / 1 member
/ 5 responses / 5 aggregates.

Then by watching two real ticks:

- The first wrote a heartbeat for a quiet tick, with its sentence, and the
  ledger correctly stayed empty — the eviction fix, confirmed in production.
- The second **replaced** it rather than appending: one row after two ticks, so
  the fixed primary key does its job against Turso and not only against a
  temporary SQLite file.

**The tick interval is 5 minutes** (305 seconds between those two heartbeats),
which had been guessed at as "every few minutes". Fifty cron-job.org executions
is therefore 4 hours 10 minutes, and `docs/deployment.md` now says so as a
measured fact rather than as a table of possibilities.

**Phase 3 is built: the dashboard reports instead of inferring.**
`resultState` decided *overdue* from fifteen minutes of silence; it now reads
the heartbeat and tells four cases apart. The one that changes behaviour: when
the scheduler **has** run since the close, the message stops naming it — sending
somebody to restart a trigger that is demonstrably running is the wrong half of
the system. "Never run" is its own message, not a delay, because that is what a
misconfigured `CRON_SECRET` looks like.

- **Both surfaces.** `question-detail-view` renders the same decision and was
  left on the old wording at first — the two would have disagreed about the
  same data, which is precisely what one shared selector exists to prevent. The
  ISO-to-Date conversion is shared now too.
- **The query budget went 8 → 9**, ratcheted at the measured value with the
  reason recorded. The heartbeat joins the existing `Promise.all`, so it costs
  a query and no waiting, and the page makes no second request — which is what
  the requirement was actually about.
- **Three E2E false positives came from the fixture's own name.** A team called
  "Scheduler Visibility Team" matched `getByText(/scheduler/i)` in the header
  and `path.includes('scheduler')` in the team id. Assertions over a page or a
  URL that carry user-chosen text have to be scoped — by region, and by path
  prefix.

**Phase 2 is built: the ledger keeps the ticks that did something.**
`SchedulerTickRecord` is appended rather than replaced — the opposite policy to
the heartbeat, and the reason they are two tables. A quiet tick writes no row:
the heartbeat has already said the scheduler ran, and keeping quiet ticks is
exactly what leaves fifty "nothing was due" entries and no trace of the morning
a check opened. Retention is 90 days, pruned by the tick itself.

Three defects came out of it, two of them in tests:

- **`prompts` counted members considered, not prompts sent.** It incremented
  regardless of what `sendSlackPrompt` returned, and that returns false for a
  member with no Slack link, one marked away, or a team outside its delivery
  window. So the response said "prompting 2 members" while sending one, and on
  a deployment where nobody has linked Slack it claimed a whole team while
  sending nothing. The sink assertions were right all along; nothing compared
  them to the number the response reported.
- **The service spread the whole `TickRecord` into the heartbeat**, which has
  no `failures` or `reasons` columns. TypeScript accepted it — excess property
  checking only fires on object literals — the in-memory fakes accepted it, and
  Prisma would have rejected every heartbeat in production, *silently*, since
  the service catches its own write failures. Found by a property test that
  handed the service an undefined field and found it in the row. Both writes
  map field by field now, and there is an integration test of the **service
  over the real repositories** — the gap that hid it, since route tests use
  fakes and repository tests build their own rows.
- **A unit test was asserting the defect**, expecting the heartbeat repository
  to receive the whole tick. It asserts the exact key set now; `toMatchObject`
  passes with extra fields still there.

Also worth carrying: the eventfulness **property test failed to catch a
mutation an example test caught** — generating counts up to 50 made "four zeros
and one non-zero" vanishingly rare. Ranges of 0..2 and 500 runs. A property test
weaker than the example it generalises is the wrong way round.

And `npm test | tail -4` hid a parse error that stopped a whole file running:
the summary line said "1909 passed" with no failures visible. Check the exit
code and the file count, not the tail.

**Phase 1 is built: the scheduler leaves proof it ran.** `SchedulerHeartbeat`
is one row, replaced by every tick — including a quiet one, which is the
criterion the whole thing rests on. Four things worth carrying:

- **The fixed primary key is load-bearing.** Without a constant to collide on
  the upsert has nothing to replace and every tick appends, at three hundred a
  day. The test that catches this counts rows over a real SQLite file through
  the libSQL adapter: an in-memory fake replaces a key whatever the database
  would have done, and "latest() returns the newest" is also true of an
  implementation that appends.
- **The route writes it, not the scheduler.** Only the route knows `prompts`,
  and it has already composed the sentence. The heartbeat carries the *same*
  sentence and tick id as the response — two accounts of one tick would leave
  anybody comparing the cron dashboard against the application with no way to
  choose.
- **A failed write never fails the tick.** The route awaits it before
  answering, so a rejection would turn a tick that opened a check into a 500.
  Caught, and recorded as `tick.record.failed` — unlike the recorder, which
  swallows in silence because it has nowhere to complain to, this has the
  recorder. A *successful* write says nothing: three hundred lines a day
  reporting the expected thing is how a log stops being read.
- **A mutation check found a defect in a test, not the code.** The flagship
  "writes one even when the tick did nothing" asserted a heartbeat was
  *present*, and the module-level container still held one from an earlier test
  — so it passed against an implementation that skipped quiet ticks entirely.
  It asserts on the heartbeat *this* tick wrote now. The shared-container
  pollution trap, for the fourth time in this repo.

`20260916140000_add_scheduler_heartbeat` is additive and applied locally.
Production needs `scripts/migrate-production.ts` and an export first.

Then the second number arrived: **Vercel's Hobby plan keeps runtime logs for one
hour.** That is where every recorder event goes. So the milestone named *Knowing
What Happened* remembers what happened for somewhere between fifty minutes and
four hours, and the question it is named after — "why did no check open on
Monday?" — is asked on Tuesday.

The eviction shape is the part worth carrying: cron-job.org's fifty are counted
in **executions**, not time, so what survives is the most recent fifty, which on
a weekly cadence is the least interesting fifty. Three eventful ticks a week are
pushed out within hours by the hundreds of quiet ones after them.

**Specified in full at `.kiro/specs/remembering-what-happened/`** — four phases,
each shippable alone:

1. A **heartbeat**: one row, replaced every tick, written even when the tick did
   nothing. It has to be every tick, because a quiet week and a stopped
   scheduler are otherwise identical — which is why the heartbeat cannot just be
   "the most recent ledger row".
2. A **ledger** of only eventful ticks, so quiet ones cannot evict them. A tick
   that *failed* to materialise is eventful although every count is zero, and is
   the most valuable row in there.
3. The **dashboard stops guessing**. `resultState` infers a stalled scheduler
   from fifteen minutes of silence; with a heartbeat it can tell "late" from
   "not running since Friday" from "never run at all" — the third being a fresh
   deploy with a bad `CRON_SECRET`, where "results are overdue" is actively
   misleading.
4. Somewhere to read the ledger — **deliberately a decision, not a design**,
   because a page nobody opens is worse than no page.

No member ids in the ledger, deliberately: it keeps the whole thing out of scope
of deletion, export, and every future retention question. Counts say a tick
prompted somebody; which member is the delivery record's job.

**And the audit-log bridge Matt asked about on 2026-09-15 is dead, for a good
reason.** The scheduler writes no audit entries — all ten change types are human
actions — so the two records never describe the same event. A shared identifier
would be an id for a join nobody can make.

**A note on how the journey E2E asserts it.** The first version pinned the
count — "computed results for 1 check" — which passed locally and failed in CI,
where the shared database carries every other spec's teams and the tick had
fourteen to consider. The count is not the tick's to control, so the assertion
does not claim one: it asserts the shape, and the unit tests pin the counts
where the input is known. Run `npx playwright test` whole, not one spec, or
this class of failure waits for CI.

**The PR-description gate had drifted from AGENTS.md.**
`check-requirement-coverage` accepted only `Requirement 1.1` while the rule
requires a reference outside the original spec to name it, so following the
rule failed the gate and passing it meant claiming the wrong spec. It takes
"Requirements: Explaining Itself 4.1" now. The spec name must be Title Case,
which is what stops the pattern matching any sentence containing a decimal.

There were two implementations of that one rule — a `.sh` CI runs and a `.ts`
the tests exercised — so the tested rule and the enforced rule could differ
with nothing going red, which is how the gap survived. A test now runs the
shell and compares the two, and caught the shell lagging the moment the
TypeScript was fixed.

A materialisation failure was swallowed with a comment saying it would be
retried next tick. It is — for ever, silently, if the cause is permanent. It
is recorded now.

**The redactor ate the ids, and only running it found that.** A team id is
thirty-six characters of letters, digits and hyphens, which is exactly what a
session-token pattern matches, so every event came out carrying
`teamId: "[redacted]"` — the record destroying the one thing it exists to
carry, while passing its own tests, which all used ids like `team-1`.
Redaction applies to prose fields only now: an id field cannot hold a token,
because the allowlist decides what an id field is.

**A stale test went with it.** `delivery.test.ts` spied on `console.error` and
asserted a string had been passed to it — the "assert the call, not the
outcome" pattern `AGENTS.md` warns about — and the line it checked said
"Slack delivery failed after 3 attempts" with no member, team or channel. It
reads the record now.

One box is left open deliberately: reading a real tick response from
cron-job.org, which needs a deploy and the next scheduled run.

This also closed the deployment spec’s last observability task, "establish how
a stopped trigger would be noticed" — three ways now, none of them an alert.

### The specs now say what is built — reconciled 2026-09-15

Matt asked whether the `.md` files were drifting from the code. Measured:
**872 citations across 219 files, 858 resolved.** Not fiction — a record that
stopped being updated at the moment work landed.

`.kiro/specs/traceability/` now holds the rule and the checker.
`scripts/check-requirement-references.ts` runs in CI and resolves every
citation to a spec, a requirement, and **a criterion that requirement lists**.
A bare number means the original spec — a convention 654 citations already
followed, named rather than invented.

Two task lists were reconciled box by box, never in bulk:

| | Before | After |
|---|---|---|
| `deployment` | 0 of 62 | **52 ticked, 10 open** |
| `reaching-your-health-check` | 0 of 48 | **17 ticked, 31 open** |

What stays open is genuinely undone: Resend’s domain, Slack’s production
URLs, a rollback note, and browser coverage for a contributor.

**Four things the reconciliation found that ticking in bulk would have
buried:**

- `/api/me/health-check` had **no test file**, while exporting a `_testRepos`
  seam "so route tests can seed data". The behaviour was right and the
  evidence was missing, which is a different problem and not a smaller one.
- `10.2` and `13.5` in the test-mode and database files had been resolving to
  the **wrong requirement** for months — integration-hardening’s numbering
  read against the original spec. Only `10.6` broke loudly enough to notice.
- `prisma validate` no longer fails against a Turso URL, deliberately, and the
  task still said it should. Reading the old task would have produced a bug
  report.
- The session lifecycle panel has **no axe coverage at all**.

The rule that stops it recurring is in `AGENTS.md`: open the requirement
before writing the code, and add one if none covers it. The checker catches a
citation that leads nowhere; only a person catches one that leads somewhere
wrong.

### Noticed on production, 2026-09-15

**The audit log printed a JSON object where a sentence belongs — fixed
2026-09-15.** The `after` state of a `schedule_change` read
`{"cadence":"weekly","openDay":1,…}` on a screen whose entire job is being
understood by a person months later, and a reader had to know that 1 means
Monday. It now reads:

```
Opens: Monday at 15:30
Closes: Friday at 17:00
Cadence: Weekly
Time zone: Europe/London
```

`audit-value.ts` holds the rule. Its governing principle is **never lose
information**: anything it cannot confidently improve — a value that is not
JSON, a half-written record, an array, an empty object — is shown exactly as it
was stored, because an audit log that quietly drops a field it did not
recognise is worse than an ugly one. An unfamiliar object still gets labelled
fields rather than a blob, so the change types that store a member summary
improved without anyone enumerating them. A day number out of range keeps its
number — "Day 9" — since data that is wrong should look wrong rather than
plausible.

`WEEK_DAYS` moved to `src/lib/week-days.ts`, shared with the settings page.
Sunday is 0, matching `Date.prototype.getDay`; two lists of the same thing is
one list and a future defect.

**The change type followed**, once Matt asked what the screen is actually for.
Requirement 18 answers it: "As a delivery manager, I want a record of
significant team setting changes, so that I can understand when and why
configuration decisions were made." A person reading their own team’s history —
so `schedule_change` was a variable name where a sentence belongs, the same
defect as the JSON beneath it. It reads **Schedule changed** now.

The token is not lost: it stays on the element as `data-change-type`, so an
entry can be correlated with a system record without a manager having to read
it. That is the mapping Matt asked about, and the audit entry id is the join
key if operational logging is ever built.

**The application was slower than it should be — fixed 2026-09-15, milestone
complete.** The first cause was geography. `x-vercel-id` read `lhr1::iad1::…`: requests entering at
London and executing in Washington, against a database in Dublin. `vercel.json`
now pins functions to `dub1`, and PR #50 records the measurement either side.

| Endpoint | `iad1` | `dub1` |
|---|---|---|
| `/api/me` signed out, no database work | 189ms | 89ms |
| session-link lookup, one query | 249ms | 98ms |
| **implied cost per query** | **~60ms** | **~9ms** |

Warm medians, ten samples, from a UK client. Cold starts stay around 1.1s and
are a Hobby-tier fact.

The rest was architectural, specced and built as
`.kiro/specs/feeling-responsive/`. **All four phases are done.**

| | Before | After |
|---|---|---|
| API requests per dashboard load | 4 | **2** |
| Identity requests per load | 2 | **0** |
| Queries per `/trends` | 9 | **8** |
| Queries per `/api/me` | 5 | 5, three of them now concurrent |
| Layout shift on the dashboard | 0.046 | **0.016** |
| Cost of one database round trip | ~60ms | **~8ms** |

How to measure it again, and what the gates are, is in `docs/performance.md`.
The short version: gates count things and run in CI; timings and Lighthouse
are commands you run deliberately. No wall-clock budget goes near CI.

**Phase 1 is done: the work is now measured rather than estimated.**
`src/tests/integration/support/counted-database.ts` counts statements through
Prisma's query event over the libSQL adapter — production's path — against a
real file. The event was verified empirically before anything was designed
around it. Budgets live in `query-budgets.test.ts` (routes) and
`e2e/request-budget.spec.ts` (page loads), as ratchets set at measured values.

Today: `GET /api/me` issues **5** queries, `GET /trends` **9**, and a dashboard
load makes **4** API requests. The spec had estimated 7 and 3 — both arrived at
by reading code. Two of the trends queries live inside services rather than the
route, and the fourth request belongs to the session lifecycle panel, which is
a component rather than a page. Neither was careless, and that is the point of
having an instrument.

A characterisation test asserted the duplicate `/api/me` **existed**, so that it
would fail when fixed. It did exactly that, twice — once when the shell stopped
asking and once when the page did.

**Phase 2 is done.** The authenticated layouts are Server Components that
resolve the member from the session cookie and hand the shell a context;
`resolveShellContext` is a function of a token, because a Server Component reads
cookies through `cookies()` and has no NextRequest. The shell stays a Client
Component — signing out is interactive — and offers the same context to the
pages inside it through `useShellContext`, since a layout cannot pass props to
its page. The default is null and load-bearing: a page rendered outside a shell
offers nothing behind a role, which is how it behaved when its own fetch failed.

A dashboard load went from **4 API requests to 2**, and from asking who is
reading **twice to not at all**. The navigation is in the HTML the server sends
— asserted by reading the document as bytes, because a rendered assertion would
pass against a shell that fetched and re-rendered while Playwright waited.

**Two mutations survived first drafts, and both mattered.** Removing the
provider from the shell broke nothing, because every test supplied the context
directly — the dashboard would have lost its manager controls in production with
the suite green. And the layout-shift budget, written to the standard 0.1,
watched the pop-in and said nothing: the page scores 0.046 with the defect and
0.016 without. It is 0.03 now, a ratchet like every other budget here.

**Phase 3 is done: nothing waits for something it does not need.** `/api/me`
and the trends route each awaited independent reads in turn.
`member-profile.service.ts` and `trend-inputs.service.ts` fan them out, and
both routes got thinner in the process — `/api/me` had assembled its response
from four repository calls inline, which the architecture rules say a handler
should not do, and which left no seam to ask "does this wait for that?".

**Concurrency is asserted by ordering, never by timing.** A read is held open
and the others must already have started; a stopwatch would measure the
machine. Two findings came out of it:

- The roles were held back on the reasoning that they depend on the team. A
  surviving mutation proved otherwise: they are looked up by team *id*, which
  the member row already carries. Three-way fan-out, not two.
- `/trends` fell from 9 queries to 8. The privacy mode and the session
  averages each read the same team row, and identical `findUnique` calls in
  the same tick are coalesced by Prisma into one `WHERE id IN (?,?)`.
  Confirmed by reading the SQL rather than inferred from the count.

`/api/me` still issues 5. Overlapping reads does not change how many queries
are made — only how many must finish in sequence, which a count cannot see.
The plan had assumed otherwise and is corrected.

That multiplies. A dashboard load makes four requests — the shell’s `/api/me`,
the page’s *second* `/api/me`, `/trends`, and `/sessions` — whose queries are
sequential awaits, about nineteen round trips in total. The duplicate `/api/me`
is documented in the dashboard as "one small GET… a fair price", which it was
when it meant one local query.

The pop-in Matt described in the navigation is structural rather than a bug:
every page is a client component that fetches on mount, and the shell honestly
renders the destinations it can name before `/api/me` resolves.

**The milestone exists for the gates rather than the milliseconds.** The
slowness was found by a person using the application — which is where every
significant defect in this project has been found — and nothing in a
1614-test suite could have told him. Phase 1 builds a query counter and
request-count gates before anything is changed, so the regression is visible
to the suite before it is fixed. Budgets are ratchets set at what the code
does today, never wall-clock timings in CI.

### Reaching your health check — spec written 2026-09-14, not started

`.kiro/specs/reaching-your-health-check/`. Written because production opened a
check exactly on schedule, generated a session link, and **told nobody** — and
the delivery manager, signed in and looking at the dashboard, had no way to
answer it.

**Nothing in the authenticated UI links to a session.** The lifecycle panel
reports "0 of 1 answered" and offers a button to *close* the check, but no
route to *answer* it. `/session/[token]` works; nothing points at it.
`e2e/journey.spec.ts` reaches it by reading the token out of the database —
the same "navigating by URLs it looked up" pattern that hid the sign-in dead
end.

**Email cannot deliver a prompt.** `EmailService` has one method,
`sendMagicLink`, and the tick calls `sendSlackPrompt` and nothing else. So
email is the only way *in* and Slack is the only way to hear there is anything
to do — two single points of failure pointing in opposite directions.

**Decided with Matt 2026-09-14:** both a dashboard link *and* a route in the
shell, because a contributor’s journey never touches the dashboard. Email
prompts added, with a member preference, because Slack stays primary and a
member who gets both is told twice. The full Slack spec including phase 3.

**The default is the interesting decision.** Email prompts default **on** for a
member with no Slack link and **off** for one with Slack linked, with an
explicit preference overriding either. Always-on-opt-out was considered and
rejected: it would start mailing every existing Slack user the day it shipped.
The stated cost is in the design — a Slack-linked member whose delivery fails
hears nothing, and a failure fallback needs the retry queue to report outcomes,
which is separate work.

**Phase 1 as built.** `MyHealthCheckService.resolve` takes a member id and
returns that member’s link — there is no parameter in which to ask for anyone
else’s, and the team comes from the member record rather than the caller.
Four outcomes rather than a nullable token: "nothing is open" and "a check is
open but you are not in it" need different words, and the second happens to a
member added after a check opened.

`/me/health-check` is the route, under a segment that already mounts the shell.
It links rather than redirects: landing straight in a form gives no moment to
realise what is about to be asked. The nav entry comes **first** and needs no
team id, so it survives the in-flight state where every other destination waits
because a guessed id 404s.

**Two existing tests were over-specified and were corrected rather than
worked around.** A property named "offers no team-scoped destination until the
team is known" asserted an exact list, so it broke when a destination needing
no team id was added — it now asserts the absence of `/teams/` links, which is
what its name claims. And the keyboard tab-order test tabbed a fixed six times,
pushing Sign out out of range.

**The E2E test clicks.** `journey.spec.ts` reaches sessions by reading the
token out of the database, which is why this suite could never have caught the
defect — the same navigating-by-looked-up-URLs pattern that hid the sign-in
dead end. The new one opens a check through the interface, follows the
dashboard link, follows the page link, and lands on the form.

**Phase 1 alone fixes the defect** and depends on nothing external.

## Outstanding Work

### Slack sign-in — spec written 2026-09-13, not started

`.kiro/specs/slack-sign-in/`. Written because provisioning exposed a
single point of failure nobody had noticed: **email is the only way in**, and
sending as a domain needs DNS records proving ownership. Without a verified
domain, Resend’s sandbox sender delivers only to the account owner and drops
everyone else **silently** — and since `requestMagicLink` returns void for every
input by design, a colleague sees "check your email" and waits forever. The tool
cannot be trialled with a team unless its owner also owns a domain.

**The chicken-and-egg that has to break:** `POST /api/me/slack-link` derives the
member from the session cookie, so you must already be signed in to link Slack.
Signing in needs email. Slack sign-in for a first-time user is impossible today.

**Slack cannot set a cookie**, so the shape is: verified Slack request →
resolve member → mint a single-use token → ephemeral reply with a link → the
existing verification route establishes the session. That is a magic link
delivered over Slack, and it reuses `verifyMagicLink`’s token lifecycle rather
than growing a parallel one with its own bugs.

**Two bindings, specified separately.** A Delivery Manager asserting which
Slack account is which member needs no new scope and unblocks a trial (phase 2).
Slack asserting it by verified email is self-service and removes email from the
critical path for good, but costs `users:read.email` — a scope this project
removed once for being speculative. It stops being speculative here, but the
decision is its own (phase 3).

**Why not simply surface session links?** They already exist per member per
session and are never shown in the UI. Surfacing them would let a manager hold a
member’s credential and submit as them — close to fatal for a tool whose whole
premise is candid feedback. A binding asserts *who* an account belongs to;
authentication stays the member’s own Slack login. NFR 3 records that.

**Workspace membership is not team membership.** No Slack interaction creates a
`TeamMember`; a contractor in one channel is in the workspace.

## Outstanding Work

### Deployment — spec written 2026-09-12, not yet implemented

`.kiro/specs/deployment/`. Two findings shaped it before any of it was written,
and both were verified against source rather than assumed.

**The Vercel Hobby plan cannot run this scheduler.** Hobby cron jobs are limited
to once per day at ±59 minutes, and a finer cron expression *fails at
deployment* rather than degrading. Every timing behaviour here is finer-grained
than a day. Agreed with Matt: an **external cron service** POSTs
`/api/scheduler/tick` with `CRON_SECRET`, keeping hosting free and changing no
application code. GitHub Actions was rejected — its scheduled runs can be
dropped under load, and scheduled workflows auto-disable after 60 days without
repository activity, which bites hardest once the project is finished and
quietly relied upon. The tick being idempotent is what makes an external
trigger acceptable at all.

**Migrations have no path to production, and `prisma migrate deploy` cannot be
given one.** Prisma’s `Datasource` takes only a url string, the provider is
`sqlite`, and Prisma’s own docs send Turso users elsewhere. The hazard is not
that the CLI cannot reach Turso — it is that `prisma.config.ts` resolves through
`resolveSqliteFileUrl()`, which ignores `TURSO_DATABASE_URL` and returns a local
path, so the command migrates a local file and exits zero. So the CLI will
**throw** when `TURSO_DATABASE_URL` is set, and `scripts/migrate-production.ts`
will apply migrations through `@libsql/client.executeMultiple` — the mechanism
already proven in `src/tests/integration/libsql-repository.test.ts` — with its
own `_applied_migration` ledger rather than a guessed-at Prisma checksum.

**`TEST_MODE` becomes impossible rather than merely unset.** It serves live
sign-in tokens; "do not set it in production" is a hope, not a control. The
guard goes at module load, because a process that can serve tokens should not
be running.

**Phase 1 as built — and it moved twice before it was right.**

`assertProductionReady` in `src/lib/startup-guards.ts` holds both rules, called
from `register` in `src/instrumentation.ts`. It takes the environment as an
argument, so the rules are exercised directly rather than through module
resets, and one test asserts the hook actually calls it.

**It started in the client factory, at module load, and `npm run build` threw
it out.** `next build` imports every route with `NODE_ENV=production` to
collect page data, so the check fired during compilation — the difference
between "this deployment will not go live" and "this project will not
compile". tsc, lint and the whole suite had passed; none of them import a
route the way the build does.

**Then the E2E suite threw it out again.** `NODE_ENV` cannot tell a deployment
from a local end-to-end run: `next start` sets production on a laptop too, and
the suite runs the production build deliberately so CI and a local run
exercise the same artifact — with `TEST_MODE` on, which is the point of the
token capture. The run now marks itself with `E2E_LOCAL_RUN`, set in
`playwright.config.ts` and nowhere else.

That marker is an opt-out on a security control, which is worth justifying: it
**fails closed**. Absent the marker every production process is checked,
including on a host setting none of the variables we might otherwise have keyed
on. Detecting the deployment instead — `VERCEL_ENV`, say — fails *open* the
moment the host changes or the variable is missing, the worse direction for a
guard against an authentication bypass.

**Measured, not assumed.** A production `next start` with no database logs
"Failed to prepare server", keeps listening, and answers every request with
500 — not literally a refusal to bind a port, and the comment says so. What
matters held: no request reached a handler and no local database file was
created. The same was confirmed for `TEST_MODE`.

`resolveCliDatasourceUrl` refuses while `TURSO_DATABASE_URL` is set and names
`scripts/migrate-production.ts`. Verified through the real CLI: `prisma
validate` fails with the message, and still validates without it.

**Phase 2 as built.** `scripts/migrate-production.ts` applies the committed
migrations to Turso through `@libsql/client.executeMultiple` and then seeds the
question catalogue through the libSQL adapter. One command, because the
catalogue is reference data the application cannot work without — not sample
data — and a second command is one someone forgets.

`applyMigrations` in `src/lib/migrations/apply-migrations.ts` keeps an
`_applied_migration` ledger and skips what is in it. **The ledger row is
written after the migration, not before, and the order is the decision.** A
crash between the two leaves a migration applied but unrecorded, so the next
run tries to re-apply it and SQLite refuses — loud, and fixable with one manual
insert. Recording first would invert that: a crash would mark a migration done
that never ran, silently skipped forever and found later as a missing column in
production. There is a test for the loud failure, so it is a choice rather than
an accident.

The ledger is deliberately **not** Prisma’s `_prisma_migrations`: that table
carries a checksum whose derivation we would be guessing at, and a mismatch
makes Prisma tooling refuse to proceed — for a table no Prisma command can read
here anyway. Cost recorded in the source: moving this database somewhere Prisma
*can* migrate needs the history reconciled by hand.

**One test was wrong before the code was.** It simulated a partial run by
deleting a ledger row — which describes a migration that ran but was not
recorded, a different state entirely. It now builds a genuine partial run, and
the deleted-row case became the loud-failure test.

The seed already upserted, so its idempotence tests passed on first write —
which this project treats as suspicious. Mutation-checked by swapping `upsert`
for `create`: two tests fail. They also cover the libSQL adapter, which
`createSeedClient` does not use, so the production path had no coverage at all.

Run for real and read back rather than trusted: two consecutive runs against a
libSQL file left 5 questions, 19 tables and 3 ledger rows.

**Phase 3 as built.** `docs/deployment.md` is the configuration reference:
every variable the application reads, whether it is secret, what happens when
it is wrong, and a rotation table naming both places each secret lives.
`.env.example` gained the four database variables it never had, and a section
listing `TEST_MODE` and `E2E_LOCAL_RUN` as things to recognise rather than use.

**Two README claims were wrong and are corrected.** It recommended piping one
migration file through `turso db shell` — which applies only the *first* of
three migrations and records nothing, so a database set up by following the
README would have been missing two schema changes with no way to tell. And it
listed Vercel Cron among services that can call the tick every 1–5 minutes,
which the Hobby plan cannot.

`CRON_SECRET` is called out as the secret most easily half-rotated: changing it
in Vercel without changing it in the cron service stops the scheduler silently,
because a refused tick looks exactly like no tick at all.

**Genesis did not audit the team it created — found in production, 2026-09-13.**
Reading the Turso database after creating a real team showed an empty audit log.
Two routes create teams and only one recorded it: `POST /api/teams` persists
team, member, role and audit in a single transaction through
`createWithCreator`; `genesis.service.ts` wrote team, member, role and session
and nothing else. Genesis is the route every first user arrives through, so the
log began mid-story, missing the entry explaining how the team came to exist and
who became its manager. This file claimed team creation persisted an audit
atomically — true of the tested route, false of the untested one.

Fixed with the same entry shape the authenticated route writes, since one event
with two shapes depending on which door was used is worse than one shape.
**Known limitation, stated in the source rather than implied:** the audit write
is not atomic with the rows above it, because genesis creates each row
individually rather than through an aggregate — the same exposure its role and
session writes already carry. Making genesis atomic is worthwhile and separate;
it would need the service to generate a member id, and no cuid package is a
dependency.

Three things can only be proven in production — that Turso answers, that the
trigger fires, that email reaches a non-owner address. Those are not a gap to
close with more tests; they are where this project’s defects have always lived.


### Anonymity suppression: a state no test could reach — 2026-09-11

`text-amber-600` on the suppression label — then reading "Insufficient data",
now "Hidden until 3 people have answered" — measured **3.19:1** against white.
Not borderline: failing AA outright, for as long as it had existed.

**It survived because nothing put a page into the state.** The label renders
only for a team in *anonymous* mode with a theme under the three-response
threshold; every seeded team in the E2E suite is attributed, and jsdom’s axe
cannot evaluate colour at all. Same shape as the skip link and the sign-out
failure message: not a rule the audit lacked, but a state nothing reached.

`e2e/accessibility.spec.ts` now seeds an anonymous team with a suppressed theme
and audits it. Proven both ways in a real browser: with amber-600 it reports
3.19:1 and fails; with amber-800 (7.09:1) it passes. It asserts the notice is
visible **before** auditing, so a seeding or threshold change fails loudly
rather than quietly auditing the wrong page — which is what the first run did,
because the chart legend carries a button with the same theme name and comes
first in the DOM.

### The E2E suite caught two things the unit suite could not — 2026-09-11

Both were consequences of the sign-in destination change, and both were found
only by running Playwright:

1. **`e2e/sign-in.ts` carried the same stale `toHaveURL(//$/)`** that
   `journey.spec.ts` did. Every spec signs in through that helper, so the whole
   suite would have failed on merge. It now waits for the member’s dashboard,
   which keeps the helper honest: it fails if sign-in ever stops delivering
   people into the app.
2. **Reading the database immediately after the genesis click raced the POST.**
   The old `toHaveURL` was doing double duty as a synchronisation point, and
   moving it after the read removed that. It passed alone and failed under a
   full run. The URL assertion is back in front of the read, deliberately.

**The landing page now probes `/api/me` and is told 401 when nobody is signed
in.** That is the server answering correctly, and the two tests that land on
`/` anonymously scope that one expectation rather than widening the global
allowlist. The alternative — a server render and a database read on every visit
to a public page — costs more than one expected rejection, and `/` stays static.


### Unanswered checks: marked, or left out — 2026-09-11

Two passes on the same day. The first marked every check nobody answered with
a dashed vertical line. Matt then asked the better question: should they be
drawn at all, and should they be allowed to happen?

**The rule that came out of it: a mark earns its place when it explains a gap
between data.** An unanswered check between two answered ones does that. One at
either end does not — there is no gap, only an edge, and it stretches the axis
into space no data will ever occupy. That is how two real checks ended up
inside a twentieth of the plot.

`answeredSpan` in `chart-geometry.ts` holds the decision as a rule over
answered-ness rather than over sessions, so it reads and tests as the rule it
is. The chart draws first-answered to last-answered inclusive; the caption
counts what it plots, because naming every closed check over a chart that draws
a subset is a lie the reader can see.

**Nothing is hidden by this.** The table lists every closed check and now names
itself as that record — it no longer borrows the figure’s caption, because the
two describe different things. The latest-session panel reports the most recent
check whether or not anybody answered it. With nothing answered at all the
figure says so instead of drawing an empty grid.

**Empty checks are not banned, deliberately.** A check nobody answered is real
information — disengagement, bad timing, a team underwater — and refusing to
record it is the same move as hiding a bad week, which this project already
rejected when it chose exclusion over deletion. What is prevented is the
*accident*: closing a check with no responses now warns first.

**Closing an unanswered check now warns first.** The confirmation dialog says
what is about to be recorded when the responded count is known to be zero —
known, not merely absent, because unknown is not zero and a guess dressed as a
fact teaches the reader to ignore the warning. Both empty checks in the live
database came from lifecycle testing, closed without anyone noticing they were
empty; the warning guards the accident without the tool ever deciding a silent
team is not worth recording.

**Transferable:** absence has to be visible in the medium the reader is using.
Stating it in the table satisfied a screen reader and left the person looking at
the picture unable to tell missing data from a broken chart. And a marker that
explains nothing is worse than no marker: it costs axis space to say so.
### Sign-in destination — fixed 2026-09-10

Found by Matt in a manual pass, three times in one sitting, each time losing
his place. `src/app/auth/magic/[token]/page.tsx` and the genesis form both
`push('/')` once the session cookie is set, and `src/app/page.tsx` was a static
marketing page with no auth check whose primary action was "Sign in with magic
link". A successful sign-in therefore delivered the member to an invitation to
sign in. The magic page's own header comment claimed it "redirects to
dashboard"; it never did.

`/` now resolves the session first and sends a signed-in visitor to
`/teams/<id>/dashboard`. Fixing it at the destination rather than at each
redirect covers magic link, genesis, and anyone who types the bare address.
`replace`, not `push`, so Back does not bounce forward into a trap. Only a team
the server actually resolved earns a redirect — a guessed id 404s.

**Why nothing caught it.** `e2e/journey.spec.ts` asserted `toHaveURL(//$/)`
after sign-in and called that a pass, then read the team id from the database
and `page.goto`-ed the dashboard, as every later test still does. The suite
navigates by URLs it looks up, so it never asked whether a signed-in person can
reach the app by clicking. It also only ever exercised **genesis**; the
returning-user `status === 'authenticated'` branch — the broken one — had no
end-to-end coverage at all. `src/tests/ui/page.test.tsx` was still the starter
template's "renders without crashing" placeholder.

**Transferable:** a redirect assertion proves where the browser stopped, not
that the member arrived anywhere useful. Assert what is on the page they land
on, and reach it the way they do.


### Integration hardening — closed

Tasks 1–26 complete. Merged to `master` as `7eba5f6` on 2026-08-26, with `ci`
and `e2e` green on master afterwards.

### Dashboard refinement — COMPLETE (2026-09-01)

Branch `fix/dashboard-defects`. Every requirement came from Matt’s manual pass
over the live app on 2026-08-30; none of it was found by a test and none of it
failed one.

**Three defects fixed:** the profile read a `privacyMode` the API never sent;
the audit log printed raw member ids; a question theme nobody answered was
omitted entirely rather than reported.

**The chart no longer misrepresents time.** Sessions are positioned by when
they closed, not by their turn in the list, so a slope means something. Series
carry a dash pattern and a marker shape as well as a colour, and the legend
swatch repeats both — blue against purple was the reported failure, and naming
colours in a legend does not help when the colours are the problem.

**"Question theme" is the user-facing term**, copy only. `Question.title` is
the theme, `Question.description` is the question a member is actually asked —
in the database since the first migration, displayed nowhere until now.

**Four findings worth reading before the next milestone**, in
`.kiro/specs/dashboard-refinement/design.md` under *What implementation
taught*: adding a control can make an existing one ambiguous; a fixed contrast
defect can return through a new component; a viewport-dependent violation
needs the viewport that triggers it; and absence has to be representable
before it can be reported.

**Session removal remains on the roadmap and unscheduled** — exclusion over
deletion, schema change deferred deliberately. See the tasks file.
### Dashboard refinement — original spec note (2026-08-31)

`.kiro/specs/dashboard-refinement/`. Every requirement comes from Matt's manual
pass over the live app against his real team data on 2026-08-30. **None of it
was found by a test and none of it failed one** — including three defects that
sat behind green suites.

**Defects:** the profile page renders `profile.privacyMode`, a field `GET
/api/me` never sends (privacy mode belongs to `Team`, not `TeamMember`); the
audit log prints raw member ids under "Changed by"; a topic nobody answered is
omitted entirely from the Latest Session panel and the topic history, so absence
and silence are indistinguishable.

**Two structural findings worth remembering.** The dashboard derives its topic
list from the aggregates rather than from the question catalogue, so a topic with
no responses is *unrepresentable* — which is why absence is invisible. And
`Question.description` — the literal question a member is asked, e.g. "How well
is the team delivering value to users and stakeholders?" — has existed since the
first migration and is displayed nowhere. The dashboard shows `Question.title`
throughout and calls it a question, when it is a theme.

**Terminology agreed 2026-08-31: "question theme"** for the five health areas,
in user-facing copy only. The API keeps calling them questions, because that is
what the model is: `Question.title` is the theme, `Question.description` is the
question text.

**Session removal — decided and deliberately not scheduled.** Matt's original ask
was to hide an anomalous row; he revised it to removal with a recorded reason
after agreeing that a dashboard which can hide a bad week can be made to lie.
Resolved as **exclusion over deletion** — responses are what team members wrote,
and destroying them to tidy a chart removes the only record anyone answered —
with hard deletion left to a future GDPR framing. Neither is scheduled; the need
may never arise. Requirement 9 and the roadmap note in `tasks.md` hold the
reasoning.

**The schema change waits, and that is deliberate.** It was considered whether to
add `excludedAt`/`exclusionReason` now, before live data. No: both are nullable
and *absent* means *not excluded*, so the migration is a metadata-only
`ALTER TABLE ADD COLUMN` with no backfill — equally cheap before or after data
exists, on SQLite and Turso alike. An unused `excludedAt` in the schema would
invite filtering on it before anyone had agreed what exclusion meant.

### Manager experience — COMPLETE (2026-08-30)

All task groups merged to `master` (`70f6e51`). A delivery manager can navigate
without knowing URLs, sign out, open and close a health check, read a dashboard
that explains itself, and be told what to do next on a new team. A colleague can
no longer be silently signed into the wrong team.

**Delivered:** PR #8 navigation shell (`5bda63b`), #11 session lifecycle
(`f536eeb`), #12 dashboard comprehension (`4c1a9c6`), #13 guidance and identity
guard (`70f6e51`). Plus #9 and #10, both fixing defects found by using the app
rather than by testing it.

**Read `.kiro/specs/manager-experience/design.md` before the next milestone.**
Its *As built* notes and the *What implementation taught* section carry the
transferable findings: dates crossing JSON as ISO strings, pinning date locales
so CI and a British machine agree, one tick one clock, why a modal's inert
background defeats focus restoration, and why two test flakes came from tests
outgrowing their time budget rather than from the code under test.

**Next milestone: deployment** — Vercel, Turso, the production cron. The
production database path already has execution coverage, so this is
configuration rather than new application code.

### Pending manual verification — nav shell (raised 2026-08-29)

Matt reviewed the shell in the browser and confirmed the active-page indicator
reads clearly and that the skip link works — though he finds it redundant on
today's short pages, worth revisiting once phase 3 adds chrome above the
content. His session ended when the Audit Log page crashed, so **sign out** and
**narrow-window behaviour** are still unchecked by hand, along with the
**screen-reader pass**. Raise these at his next manual testing session. Both
remaining items are covered by automated tests — but so was the audit log page,
whose route test and UI mock each asserted a different response shape and both
passed.

### Manager experience — session lifecycle, merged as PR #11

A delivery manager can now open and close a health check from the dashboard,
which is the milestone's reason for existing.

- `SessionLifecyclePanel` derives one of four states from the session list plus
  which sessions have materialised aggregates: `collecting`, `awaiting_results`,
  `idle`, `never_run`. `awaiting_results` exists because closing does not
  compute results — a scheduler tick does, at least 30s later — and an empty
  dashboard would otherwise read as nobody having answered
- Closing is confirmed through a native `<dialog>`; opening is not, because the
  service closes any existing open session when a new one opens
- **jsdom 29 implements neither `showModal()` nor the `cancel` event.** The
  component falls back to the `open` property so the confirmation stays
  assertable there, and `e2e/session-lifecycle.spec.ts` asserts `:modal` in a
  real browser so a regression to a non-modal dialog fails
- **Focus restoration must close the dialog first.** While a modal is open the
  rest of the page is inert, so focusing the trigger before closing is silently
  ignored. Found in a browser; jsdom has no top layer and cannot catch it
- `e2e/journey.spec.ts` now drives open and close through the UI. The scheduler
  tick is the only remaining API call in it, by design
- Session data crosses JSON as **ISO strings**; the panel parses them before the
  date comparison in `deriveSessionState`. MSW handlers mirror that, since a
  mock returning `Date` objects would hide the parsing bug

### Manager experience — navigation shell, merged as PR #8 (`5bda63b`)

Two follow-up fixes found by using the app merged after it: PR #9 (magic link
claimed twice) and PR #10 (audit log response shape).

**Accessibility position.** Axe now covers the shell on settings, dashboard and
profile, plus three states a page-level audit never reaches: the skip link once
focused (it is clipped to 1×1 and skipped by axe until then), the sign-out
failure message, and the dashboard at 320px — the width WCAG 2.1 AA 1.4.10
actually specifies, being 1280px at 400% zoom. Focus order through the shell is
asserted in `e2e/navigation.spec.ts`, since axe cannot judge it. **A
screen-reader pass has still not happened**.

**Accessibility position, agreed 2026-08-30.** WCAG 2.1 AA is the standard this
project constantly aims for, not one it claims to meet. Every new state gets axe
against the AA rule set, asserted semantics, and keyboard operation driven
end-to-end — that is the standing bar for any change. A formal audit including a
screen-reader pass is the gate on *claiming* conformance, not a blocker on
shipping work. Do not treat "no screen-reader pass yet" as a reason to hold a
milestone; do treat it as a reason never to write that the app is AA conformant.

**E2E fixture.** `allowConsoleErrors(page, pattern)` in `e2e/fixtures.ts` scopes
an expected console error to one test. Some states can only be reached by
provoking a failed request, and the browser logs it; widening the global
allowlist would stop the suite noticing real 500s.

**E2E seeding.** `seedTeam` clears `UserSession`, `MagicLink` and
`SlackIdentityLink` for every member of the team before deleting them, not just
its own member — a team can also hold `seedMember` members, and deleting one who
has signed in fails a foreign key when `beforeAll` re-runs after a failure.

**Mounting.** `src/app/teams/[teamId]/layout.tsx` and `src/app/me/layout.tsx`
render `<AppShell>`. Mounting per segment rather than by a runtime check means
`/`, `/auth/*` and `/session/[token]` cannot render it — they are not in those
trees. The shell owns the page's single `main` landmark, so the four
authenticated pages had their own `<main>` wrappers converted to `div`.

**Requirement 1.7 cannot be tested in jsdom.** Rendering a page component never
composes its layouts, so "this route has no navigation" passes there whether or
not a layout wraps it in production. It is covered by
`src/tests/contracts/app-shell-mounting.test.ts`, which scans the route tree and
pins which layouts mount the shell, plus `e2e/navigation.spec.ts`.

**E2E rate-limit trap.** Magic links are limited to five per email per hour,
process-wide. A spec that signs the same member in from many tests stops
receiving tokens partway through and hangs on the verification page, far from
the cause. `seedMember` in `e2e/db.ts` exists so each test can use its own
member; leave headroom for CI's two retries.

The shell holds three states: `loading` keeps the navigation landmark and
offers only Profile, because a guessed team id produces links that 404;
`ready` offers Dashboard, Settings, Profile and — for a delivery manager —
the audit log; `anonymous` (401 or unreachable) removes the shell entirely and
leaves the page to explain itself. The audit log is the only
Delivery-Manager-only *read* in the API, so it is the only role-gated nav entry.

Sign out is the shell's one action, and the first caller of
`POST /api/auth/logout` in the product. It navigates only after the server has
answered: clearing the cookie without a successful revoke would leave a working
`UserSession` row while telling the member they are signed out.
Agreed as the milestone before deployment, because the tool is about to be
trialled with a real team and then shared with other delivery managers, and it
currently has no navigation and no UI for its central action.

### Non-functional baseline — completed 2026-08-26

Merged to `master` as `67e16d5`. Assessment of where the suite stood, and the
order of work that was carried out.

**Security coverage today.** 67 assertions of 401/403 across 25 route test
files, plus Slack signature verification, rate limiting, privacy suppression,
session expiry and scoping, anti-enumeration, and a contract test that scans
production sources for reintroduced identity headers. That covers *our
authorisation rules*. It covers no *vulnerability classes* at all — nothing
tests for injection, XSS, SSRF, or dependency CVEs.

**Measured gaps:**

- `npm audit`: 12 production-dependency vulnerabilities (8 high, 4 moderate),
  15 including dev. Nothing in CI checks this.
- Axe runs with `withTags(['wcag2a', 'wcag2aa'])` — **WCAG 2.0 only**, despite
  the file claiming 2.1 AA. Every criterion added in 2.1 is unchecked: reflow
  (1.4.10), non-text contrast (1.4.11), text spacing (1.4.12), content on
  hover/focus (1.4.13), status messages (4.1.3), input purpose (1.3.5).
- No Dependabot, no SAST, no `SECURITY.md`, no CSRF on dashboard forms.
- `TEST_MODE` remains a genuine footgun: set in a deployed environment it would
  expose live sign-in tokens through `/api/test/magic-link`.

**Agreed order:**

1. Fix the axe tags to include `wcag21a`/`wcag21aa` and repair what that surfaces
2. Dependabot configuration
3. CodeQL workflow (free on this public repo; real taint analysis ESLint cannot do)
4. Triage the 12 audit findings
5. `SECURITY.md`
6. Decide on Sonar afterwards — its additive value is coverage trends and
   security hotspots, which overlaps existing ESLint and test discipline, so it
   ranks below the free native tooling

**Accessibility position to be honest about:** automated passes detect roughly a
third to a half of WCAG issues. Fixing the tags is necessary but does not let us
claim AA conformance. That needs a keyboard-only pass, a screen reader smoke
test, 400% zoom/reflow, and closing the known gaps — no skip links, no focus
management on route change, no `prefers-reduced-motion`, Chromium-only.

**Agreed cadence:** fast and deterministic checks (axe, lint, `npm audit`,
CodeQL) run on every PR; a weekly scheduled sweep catches newly-disclosed CVEs
in unchanged code, which a PR trigger structurally cannot; manual accessibility
audits and threat-model review happen per milestone.

**Documentation decision:** a delivery-manager user guide is wanted, but in-app
guidance comes first — there is no shared navigation, so the app is currently
navigated by knowing URLs, and a guide would paper over that. Docs belong in a
`docs/` folder in-repo, not the GitHub wiki: the wiki is a separate repository,
is not reviewed through pull requests, and drifts silently from the code, which
is the exact failure mode the closure audit existed to correct.

### Deferred follow-up milestones

Session lifecycle UI, dashboard clarity, and shared navigation moved out of this
list on 2026-08-28 into `.kiro/specs/manager-experience/`.

- Multi-team membership (guarded against, not supported — see the spec status above)
- Deployment: Vercel, Turso, and the production cron trigger. Explicitly after the manager experience
- Delivery-manager user guide in `docs/`, once in-app guidance exists
- Design system / component library and dark mode
- CSRF protection and generalized non-auth rate limiting
- Load/performance testing and operational telemetry
- Optional Slack conversational events and richer interaction feedback beyond Requirements 7–8
- **Slack Socket Mode (evaluate, raised 2026-08-25):** deliver commands/interactions/events
  over an outbound WebSocket instead of public request URLs, removing the ngrok tunnel from
  local development. Not adopted now: our three endpoints are signature-verifying route
  handlers, and Socket Mode needs a persistent WebSocket client plus an app-level token,
  which does not fit Vercel serverless. Evaluate as development-only convenience with HTTP
  endpoints retained for production
