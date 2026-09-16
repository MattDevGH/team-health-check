# Implementation Plan

Four phases, each shippable on its own. Phase 1 alone answers "has it stopped?"
and is worth having even if nothing else is built.

Estimates assume the existing cadence: one green behaviour per commit, tests
first, one PR per phase.

---

## Phase 1 — Proof that it ran

*Answers: is the scheduler alive, and what did it last do?*

### 1.1 A place to put it

- [ ] **Take a production snapshot before `migrate-production.ts` runs.** Turso
      has export and **no** point-in-time restore, so this is the only way
      back. Not a blocker on writing the migration — it is the step before
      applying one, and applying is a separate deliberate command
- [x] `SchedulerHeartbeat` in the schema: a fixed single-row key, `ranAt`,
      `tickId`, `summary`, and the counts
- [x] Additive migration, applied locally; the ledger-gap test still passes
- [x] Repository interface, in-memory fake and Prisma implementation, per the
      standing pattern
- [x] Integration test over a real SQLite file through the libSQL adapter: the
      second write **replaces** rather than appends, asserted by counting rows
      rather than by reading the newest one back. An in-memory fake passes
      either way, which is why this is not a unit test
- [x] Integration test: two ticks writing at once leave one row, and it is one
      of theirs — which of them is deliberately not asserted
- [x] Integration test: `latest()` is null before the scheduler has ever run,
      since "never" is a state with its own message rather than a zero
- [x] Mutation check: an implementation that appends fails five of the seven
- _Requirements: Remembering What Happened 1.2, 1.5, NFR 4.1, NFR 4.2_
- _Property: 1_

### 1.2 Every tick writes one

- [x] Failing test: a quiet tick writes a heartbeat — the case the whole
      requirement rests on, since a quiet week must not look like a stopped one
- [x] Failing test: it carries the **same** sentence and tick id the response
      carried. Two accounts of one tick would leave anybody comparing the cron
      dashboard against the application with no way to choose between them
- [x] Failing test: the heartbeat's time is the tick's, not the read's
- [x] Failing test: it carries `prompts`, which only the route knows — a
      heartbeat written inside the scheduler could not report it
- [x] Failing test: it carries no answer content, since it outlives everything
      else that might
- [x] Wire it in the route, through a service, so phase 2's eventfulness
      predicate and pruning have somewhere to live that is not a route handler
- [x] Mutation check: skipping quiet ticks fails five tests.
      **The first version of the flagship test did not catch it** — the
      container is module-level and shared across the file, so an earlier
      test's heartbeat was still there and `not.toBeNull()` passed against an
      implementation that skipped quiet ticks entirely. It asserts on the
      heartbeat *this* tick wrote now
- _Requirements: Remembering What Happened 1.1, 1.3_
- _Property: 1_

### 1.3 It cannot break the tick

- [x] Failing test: when the heartbeat write throws, the tick still returns its
      summary, and the sessions it opened stayed open — asserted at the route,
      reading the session back from the repository rather than inferring it
      from the response the same code path produced
- [x] Failing test: the failure is recorded as `tick.record.failed` through the
      existing recorder — this has somewhere to complain to, unlike the
      recorder itself, so it does not swallow silently
- [x] Failing test: it says which tick and why, since a failure that cannot be
      attributed is a line nobody can act on
- [x] Failing test: a heartbeat that **was** written says nothing. A line per
      tick is three hundred a day reporting the expected thing, which is how a
      log stops being read
- [x] Mutation check: removing the try/catch fails six tests across both levels
- _Requirements: Remembering What Happened 1.4, NFR 2.1, NFR 2.2_
- _Property: 4_

**Checkpoint:** "has the scheduler stopped?" is answerable. One PR.

---

## Phase 2 — The ticks worth keeping

*Answers: what happened on Monday?*

### 2.1 Which ticks are eventful

- [x] **Defect found first.** `prompts` counted members considered, not
      prompts sent: it incremented regardless of what `sendSlackPrompt`
      returned, and that returns false for a member with no Slack link, one
      marked away, or a team outside its delivery window. The response said
      "prompting 2 members" while sending one. The count decides eventfulness,
      so it had to be right before anything read it
- [x] Failing test: a tick that opened, closed, materialised or prompted
      anything is eventful
- [x] Failing test: a tick that did none of those is not, however many teams it
      passed over — a Wednesday is not an event
- [x] The scheduler counts its failures. They were recorded and dropped from
      the summary, so a tick that failed to compute a result reported exactly
      the counts of a quiet Wednesday. Counted where it is recorded, and a test
      compares the count against the lines it produced
- [x] Failing test: a tick that failed to materialise is eventful **even though
      every count is zero** — it is eventful precisely because nothing happened,
      and this is the single most valuable row the ledger will hold
- [x] Property test: eventfulness is a function of the summary alone, so it can
      never disagree with what the tick reported
- [x] Mutation check on every term of the predicate.
      **The property test failed to catch the first mutation** — generating
      counts up to 50 made "four zeros and one non-zero" vanishingly rare, so
      the example test caught what the property test missed, which is the wrong
      way round. Ranges of 0..2, 500 runs, and the five single-field cases
      enumerated rather than left to chance
- _Requirements: Remembering What Happened 2.1, 2.2, 2.3_
- _Property: 2, 3_

### 2.2 The ledger

- [x] `SchedulerTickRecord`: `tickId`, `ranAt`, counts, reasons, summary. Index
      on `ranAt`, which both the reverse-chronological read and the prune need
- [x] Additive migration, applied locally
- [x] Failing test: an eventful tick adds exactly one row
- [x] Failing test: a quiet tick adds none — the eviction problem, asserted.
      On this tick's own id, since the container is shared across the file
- [x] Failing test: entries read back newest first, a page at a time
- [x] Failing test: reasons survive a round trip through a text column, and a
      row holding text that is not JSON reads as `{}` rather than taking a page
      down
- [x] Failing test: no row contains a member id, an email, a token, a score or
      a trend. Generated, and as an **allowlist over the row's keys** rather
      than a search for forbidden words — a search passes for every input
      nobody thought to generate, while this fails the moment a field is added
- [x] **The property test found a real leak**, and following it up found a
      worse one: the service spread the whole `TickRecord` into the heartbeat,
      which has no `failures` or `reasons` columns. TypeScript accepted it
      (excess property checking only fires on literals), the fakes accepted it,
      and Prisma would have rejected every heartbeat in production — silently,
      since the service catches its own write failures. Both writes map field
      by field now
- [x] Integration test of the **service over the real repositories**, which is
      the gap that hid it: route tests use fakes, repository tests build their
      own rows, and neither exercised the production path. Restoring the spread
      fails all three
- [x] Fixed a unit test that was **asserting the defect** — it expected the
      heartbeat repository to receive the whole tick
- _Requirements: Remembering What Happened 2.1, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3_
- _Property: 2, 3, 6_

### 2.3 It stops growing

- [ ] Failing test: an entry older than the retention period is gone after a
      tick
- [ ] Failing test: one inside it is not
- [ ] Failing test: pruning nothing is harmless, which is what happens on
      almost every tick
- [ ] Failing test: a pruning failure does not fail the tick
- [ ] Query-budget test: pruning is an indexed ranged delete, not a scan. The
      existing counter harness is the only thing that can see the difference
- [ ] State the period — 90 days — in `docs/operations.md`
- _Requirements: Remembering What Happened 3.1, 3.2, 3.3, 3.4, NFR 1.2_
- _Property: 5_

**Checkpoint:** a question asked the following week has an answer. One PR.

---

## Phase 3 — The dashboard stops guessing

*Answers: is this my problem or the scheduler's?*

### 3.1 Three states where there was one

- [ ] Failing test: overdue, and the scheduler has run since the close — say
      results are late, not that the scheduler may be down
- [ ] Failing test: overdue, and it has not run since the close — say when it
      last ran
- [ ] Failing test: it has never run — say that. This is a fresh deployment
      with a misconfigured `CRON_SECRET`, and "results are overdue" is an
      actively misleading thing to say about it
- [ ] Failing test: the existing `pending` and `shown` states are untouched
- [ ] The wording is intelligible to somebody who has never heard of a tick
- _Requirements: Remembering What Happened 5.1, 5.2, 5.3, 5.4_

### 3.2 On the real page

- [ ] The heartbeat is read alongside what the dashboard already fetches
- [ ] Query-budget test: no additional round trip, ratcheted at the measured
      value per the existing convention
- [ ] UI test for each of the three messages
- [ ] axe on the new states
- [ ] End-to-end: close a check, do not tick, and read what the page says
- _Requirements: Remembering What Happened 5.5, NFR 3.1_

**Checkpoint:** the interface reports instead of inferring. One PR.

---

## Phase 4 — Somewhere to read the ledger — *a decision, not a design*

Phase 2 makes the record exist; nothing yet reads it back except a query at a
prompt.

**This is deliberately unspecified.** Three options, and the right one depends
on how often the question actually gets asked once Phase 3 has removed most of
the reasons to ask it:

1. **Nothing.** The dashboard message covers the common case, and the ledger is
   there for the rare occasion somebody opens a database client. Cheapest, and
   possibly correct.
2. **An endpoint** — `GET /api/scheduler/history`, behind `CRON_SECRET` or the
   Delivery Manager role. One `curl` away, no UI to maintain, no accessibility
   surface.
3. **A page.** Honest about who it is for, which is a maintainer and not a
   delivery manager, and therefore a page that exists for one person.

A page nobody opens is worse than no page. Decide after Phase 3 has been live
long enough to know.

---

## Deliberately not in this milestone

- **Recording anything but the scheduler.** Requests, Slack interactions and
  sign-ins keep the platform's hour. The scheduler is unattended, which is what
  makes forgetting it expensive.
- **Alerting.** Nothing pages anybody. This makes a stopped scheduler visible to
  somebody who looks.
- **A shared identifier with the audit log.** Checked on 2026-09-16: the
  scheduler writes no audit entries, and all ten change types are human actions.
  There is no join to make.
- **Log drains or a hosted service.** No account, no vendor, no network call —
  the position `knowing-what-happened` took, unchanged.
