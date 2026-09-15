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

- [x] Failing test: a known operation reports its known query count
- [x] Failing test: the counter reports zero for an operation that makes none —
      the case that would make every later budget vacuous
- [x] Failing test: counts are isolated between operations, so one test cannot
      inherit another's total
- [x] Wraps the libSQL client used by the real-file integration tier, so it
      counts what the adapter actually sends rather than what a fake was asked
- _Requirements: 4.2_
- _Property: covered by its own test, since a counter is an instrument_

### 1.2 Record today's counts as ratchets

- [x] Failing test: `GET /api/me` issues at most 5 queries
- [x] Failing test: `GET /api/teams/[teamId]/trends` issues at most 9 — the estimate said 7
- [x] Mutation check: add a query to each route and confirm the gate fails
- _Requirements: 4.2, 4.4, NFR 1.2_

### 1.3 Count the requests a page makes

- [x] Failing test: a dashboard load makes at most 4 `/api/` requests today — the estimate said 3
- [x] Failing test: it requests `/api/me` exactly once — which fails now, because
      it asks twice
- [x] Mutation check: remove one fetch and confirm the count moves
- _Requirements: 4.1, 1.1_

**Two estimates in this plan were wrong, and the instrument found both.**
`/trends` issues 9 queries rather than 7, because two of them live inside the
services the route calls rather than in the route. A dashboard load makes 4
requests rather than 3, because the session lifecycle panel makes one of its
own — easy to miss, since it is a component rather than a page. Neither
estimate was careless; both were arrived at by reading code, which is exactly
what an instrument is for not doing.

**Checkpoint:** the regression that prompted this milestone is now visible to
the suite. One PR.

---

## Phase 2 — Resolve identity once, on the server

### 2.1 The authenticated layout resolves the member

- [x] Failing test: the layout renders the shell with its destinations already
      present, with no client request for identity
- [x] Failing test: an unresolvable member renders no shell, exactly as today
- [x] Read `node_modules/next/dist/docs/` on layouts, `cookies()` and Server
      Components before writing any of it
- _Requirements: 1.1, 2.1, 2.3_

### 2.2 Pages take identity rather than fetching it

- [x] Failing test: the dashboard shows Delivery-Manager controls from the
      identity it was given, with no request of its own
- [x] Failing test: rendered without one, the page behaves as it does today —
      the isolation the duplicate fetch was protecting
- [x] Failing test: `/api/me` still answers, for the session page that needs it
- [x] The request-count gate from 1.3 now expects one fewer
- _Requirements: 1.2, 1.3, 1.4, NFR 1.1_

### 2.3 Prove the pop-in is gone

- [x] Failing test: Cumulative Layout Shift below 0.1 on the dashboard
- [x] Failing test: the navigation's full destination set is present in first
      paint for a signed-in member
- [x] Mutation check: restore the client fetch and confirm both fail
- _Requirements: 2.1, 2.2, 4.3, NFR 1.3_

**The layout-shift budget had to be a ratchet, and mutation is what said so.**
Written first to 0.1 — the industry threshold, and what the requirement
asked for — it survived the mutation that restores the pop-in: the dashboard
scored 0.046 *with* the defect, against 0.016 without. A test that watches
the thing it was written for and says nothing is decoration, so the budget is
0.03 and the requirement now says why.

**Checkpoint:** the menu arrives whole and the dashboard asks nothing. One PR.

---

## Phase 3 — Stop queueing work that could overlap

### 3.1 Independent queries run together

- [x] Failing test: `/api/me` returns exactly what it returns today
- [x] The Slack link, the team **and the roles** resolve concurrently — the
      roles were held back at first on the reasoning that they depend on the
      team, and a surviving mutation proved that wrong: they are looked up by
      team *id*, which the member row already carries
- [x] Failing test: `/trends` returns exactly what it returns today
- [x] The question catalogue resolves alongside the work it does not depend on
- [x] No write is parallelised
- _Requirements: 3.1, 3.3_
- _Properties: 2, 3_

### 3.2 Re-measure the budgets

- [x] Re-measure and update what the routes issue
- [x] Mutation check: each budget fails when a query is added, and when the
      reads are made sequential again
- _Requirements: 3.2, 4.4_

**"Lower the ratchets" assumed the wrong thing.** Running queries concurrently
does not change how many are issued — it changes how many must finish in
sequence, which a count cannot see. `/api/me` still issues 5.

`/trends` did fall, 9 to 8, for a reason worth keeping: the privacy mode and
the session averages each read the same team row, and identical `findUnique`
calls landing in the same tick are coalesced by Prisma into one
`WHERE id IN (?,?)`. Overlapping the waits removed a round trip as well as
hiding one. Verified by reading the SQL, not inferred from the count.

**Checkpoint:** nothing waits for something it does not need. One PR.

Two routes became thin in passing. `/api/me` assembled its response from four
repository calls inline, which the architecture rules say a handler should not
do — and code with no seam cannot be asked "does this wait for that?".

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
