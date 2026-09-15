# Design Document

## Overview

Three changes and a set of gates. The gates are the point: the slowness was
found by a person using the application, and nothing in a 1614-test suite could
have told him.

Read `node_modules/next/dist/docs/` before writing any of this. The claims below
were checked against the bundled docs for the installed version on 2026-09-15:
Server Components may perform any asynchronous I/O including direct database
access; `cookies()` is awaited and opts a route into dynamic rendering; and
streaming is via `loading.js` or `<Suspense>`.

## Key Decisions

### 1. The region change is already done, and is recorded here as context

`vercel.json` pins functions to `dub1`, beside the database. Measured against
production, warm, from a UK client:

| Endpoint | Before (`iad1`) | After (`dub1`) |
|---|---|---|
| `/api/me` signed out — no database work | 189ms | 89ms |
| session-link lookup — one query | 249ms | 98ms |
| **Implied cost per query** | **~60ms** | **~9ms** |

A dashboard load's ~19 round trips therefore fell from about 1.1s to about 0.17s
of pure database latency. That is most of the felt slowness, and it is why the
remaining work is worth doing carefully rather than urgently.

Cold starts (~1.1s) are a Hobby-tier fact and are out of scope.

### 2. Identity is resolved on the server, in the layout

The authenticated segments already have layouts that mount the shell. Those
layouts become Server Components that resolve the member from the session cookie
and pass the result into the shell as props.

This removes three things at once: the shell's `/api/me` round trip, the
dashboard's duplicate of it, and the pop-in — because a server-rendered shell has
its destinations before the HTML is sent.

**The shell stays a Client Component.** It has a pathname, a sign-out button and
error state; those are interactivity, and interactivity belongs on the client. A
Server Component parent passing props to a Client Component child is the ordinary
arrangement, not a compromise.

**Pages keep working in isolation.** Requirement 1.3 exists because the current
duplicate fetch was defended on exactly that ground, and the defence was sound:
a page that renders only inside one layout cannot be tested on its own. So the
identity reaches pages as a prop with a defined fallback, and a page rendered
without one behaves as it does today rather than throwing.

`/api/me` remains. The session page genuinely needs to ask, from the client,
whether its reader has an application to return to.

### 3. Independent queries run concurrently

`/api/me` issues five sequential queries. Two of them — the Slack link and the
team — depend only on the member, not on each other. `/trends` issues seven, of
which the question catalogue depends on nothing at all.

`Promise.all` where the dependency graph allows it. This is worth roughly one
round trip each now that a round trip is 9ms, which is honest about the size of
the win: it is done for the shape of the code as much as the milliseconds, and
the budgets in Requirement 4 are what keep it from regrowing.

**Query count is the gate, not query depth.** Depth is what actually costs time,
and measuring it needs timestamps and a longest-chain calculation — machinery
that would itself need testing. Count is exact, cheap, and catches the failure
that actually happens: someone adds a query inside a loop.

### 4. The budgets are ratchets, not targets

Set at what the code does when this lands. A ratchet fails when the number grows,
which turns "we accidentally made every dashboard load do twelve queries" into a
failing test with a name, and leaves "we deliberately need one more" as a
one-line change with a reviewer.

Wall-clock budgets in CI are rejected outright (Requirement 4.5). They vary with
the runner, they fail on a slow morning, and a test that fails for reasons
unrelated to the change is a test somebody disables. The wall-clock measurement
lives in a documented command run against production, deliberately.

### 5. Layout shift is the testable form of "pop-in"

"The menu fills in" is a real complaint and an unfalsifiable test. Cumulative
Layout Shift is the standard measure of the same thing, has an agreed threshold
(0.1), and is observable in the browser tier through `PerformanceObserver`.

It is also the honest one: the objection is not that data arrives asynchronously,
it is that arriving data moves what is already on screen.

## Correctness Properties

1. **One identity resolution per page load.** No authenticated page load resolves
   the member more than once, by any route.
2. **A budget is never met by losing data.** Every route returns the same
   response after this work as before it, for the same inputs.
3. **Concurrency does not reorder effects.** Only reads run concurrently; nothing
   that writes is parallelised.
4. **The navigation is complete or absent.** A signed-in member sees every
   destination they are entitled to, in first paint; an unresolved member sees no
   shell, exactly as today.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Requests per page load | E2E | Only a browser makes the requests a browser makes |
| Queries per route | Integration, over a real file | The count is a property of the adapter, not of a fake |
| Layout shift | E2E | Needs a layout, a paint, and a second one |
| Identity reaching a page as a prop | UI | The fallback is the interesting case and it is a render |
| Responses unchanged | The existing suite | 1614 tests already assert what these routes return |

**The query counter must itself be proven.** A counter wired to nothing reports
zero and passes every budget. Its own test asserts a known query count for a
known operation, and the budgets are mutation-checked by adding a query and
confirming the gate fails.

## Out Of Scope

- Cold starts. A Hobby-tier fact; the daily cron is the only thing keeping
  anything warm, and paying to fix it is a different decision.
- Caching of any kind. Health check data is small and changes rarely, but a cache
  is a correctness surface, and this milestone is about not doing unnecessary
  work rather than about remembering the answers to work already done.
- The audit log's JSON `after` state. Raised at the same time and recorded in
  `AI_CONTEXT.md`, but it is a readability defect rather than a performance one.
- Bundle size and code splitting. Not measured, therefore not claimed.
