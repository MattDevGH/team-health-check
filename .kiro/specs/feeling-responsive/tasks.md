# Implementation Plan

Phase 1 builds the instrument, because a change made without one is a change
whose effect nobody can state. Phases 2 and 3 then have something to prove
themselves against, and phase 4 closes the gates behind them.

Every phase is independent and shippable on its own.

---

## Phase 0 — Already done

### 0.1 Run the functions beside the database

- [x] Measure production and record where functions execute and what a query costs
- [x] Pin the region in `vercel.json`
- [x] Re-measure and record the difference
- _Requirements: 5.2, NFR 1_

Merged as PR #50. `lhr1::iad1::…` became `lhr1::dub1::…`; a query fell from
~60ms to ~9ms.

---

## Phase 1 — Count what we are about to change

### 1.1 A query counter that can fail

- [ ] Failing test: a known operation reports its known query count
- [ ] Failing test: the counter reports zero for an operation that makes none —
      the case that would make every later budget vacuous
- [ ] Failing test: counts are isolated between operations, so one test cannot
      inherit another's total
- [ ] Wraps the libSQL client used by the real-file integration tier, so it
      counts what the adapter actually sends rather than what a fake was asked
- _Requirements: 4.2_
- _Property: covered by its own test, since a counter is an instrument_

### 1.2 Record today's counts as ratchets

- [ ] Failing test: `GET /api/me` issues at most 5 queries
- [ ] Failing test: `GET /api/teams/[teamId]/trends` issues at most 7
- [ ] Mutation check: add a query to each route and confirm the gate fails
- _Requirements: 4.2, 4.4, NFR 1.2_

### 1.3 Count the requests a page makes

- [ ] Failing test: a dashboard load makes at most 3 `/api/` requests today
- [ ] Failing test: it requests `/api/me` exactly once — which fails now, because
      it asks twice
- [ ] Mutation check: remove one fetch and confirm the count moves
- _Requirements: 4.1, 1.1_

**Checkpoint:** the regression that prompted this milestone is now visible to
the suite. One PR.

---

## Phase 2 — Resolve identity once, on the server

### 2.1 The authenticated layout resolves the member

- [ ] Failing test: the layout renders the shell with its destinations already
      present, with no client request for identity
- [ ] Failing test: an unresolvable member renders no shell, exactly as today
- [ ] Read `node_modules/next/dist/docs/` on layouts, `cookies()` and Server
      Components before writing any of it
- _Requirements: 1.1, 2.1, 2.3_

### 2.2 Pages take identity rather than fetching it

- [ ] Failing test: the dashboard shows Delivery-Manager controls from the
      identity it was given, with no request of its own
- [ ] Failing test: rendered without one, the page behaves as it does today —
      the isolation the duplicate fetch was protecting
- [ ] Failing test: `/api/me` still answers, for the session page that needs it
- [ ] The request-count gate from 1.3 now expects one fewer
- _Requirements: 1.2, 1.3, 1.4, NFR 1.1_

### 2.3 Prove the pop-in is gone

- [ ] Failing test: Cumulative Layout Shift below 0.1 on the dashboard
- [ ] Failing test: the navigation's full destination set is present in first
      paint for a signed-in member
- [ ] Mutation check: restore the client fetch and confirm both fail
- _Requirements: 2.1, 2.2, 4.3, NFR 1.3_

**Checkpoint:** the menu arrives whole and the dashboard asks once. One PR.

---

## Phase 3 — Stop queueing work that could overlap

### 3.1 Independent queries run together

- [ ] Failing test: `/api/me` returns exactly what it returns today
- [ ] The Slack link and the team resolve concurrently; roles still wait on the
      team, because they depend on it
- [ ] Failing test: `/trends` returns exactly what it returns today
- [ ] The question catalogue resolves alongside the work it does not depend on
- [ ] No write is parallelised
- _Requirements: 3.1, 3.3_
- _Properties: 2, 3_

### 3.2 Lower the ratchets to the new counts

- [ ] Update the budgets from 1.2 to what the routes now issue
- [ ] Mutation check: each new budget fails when a query is added
- _Requirements: 3.2, 4.4_

**Checkpoint:** nothing waits for something it does not need. One PR.

---

## Phase 4 — Leave it measurable

### 4.1 Document how to measure production

- [ ] The command, the endpoint that isolates database latency from function
      latency, and why that particular endpoint
- [ ] The 2026-09-15 before-and-after numbers as the baseline
- [ ] Stated plainly as a deliberate check, never a CI gate
- _Requirements: 5.1, 5.2, 5.3_

### 4.2 Close the milestone

- [ ] `AI_CONTEXT.md` and `README.md` reflect the budgets and where they live
- [ ] The outstanding-work note that opened this milestone is replaced by what
      was done
- [ ] Full suite, lint, type check, build, browser suite
- [ ] Walk production and say whether it feels different — the only test that
      matched the original report
- _Requirements: NFR 2_

**Checkpoint:** a future regression fails a run rather than waiting for someone
to notice. One PR.
