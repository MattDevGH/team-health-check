# Technical Design Document: Manager Experience

> **Status: delivered.** This document described the intended design before the
> work began. Where implementation found something the design had not accounted
> for, an *As built* note records what changed and why. The notes are the
> interesting part: each one is something only writing or running the code
> revealed.

## Overview

Five changes, in dependency order: a navigation shell, session lifecycle controls,
dashboard comprehension fixes, first-run guidance, and a guard against ambiguous
identity. Four are frontend; the fifth is a small service and repository change.

No new architecture. Route handler → service → repository interface → Prisma
stands. The only backend additions are one repository method, one service guard,
and additive fields on an existing response.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Shell mounted by segment layouts, not a runtime auth check | `/teams/[teamId]/*` and `/me` are the authenticated areas. A layout per segment satisfies Requirement 1.7 structurally: unauthenticated pages cannot accidentally render the shell because they are not inside it. |
| Shell is a client component fetching `/api/me` | Every existing page is a client component fetching its own data. A server component reading cookies via `next/headers` and calling repositories directly would introduce a second data-access pattern for one component's benefit. |
| Extend `/api/me` rather than add `/api/me/context` | The shell needs team id, team name, and roles. `/api/me` already resolves the member; adding two fields is cheaper than a second round trip on every page. Additive, so existing consumers are unaffected. |
| Lifecycle controls live on the dashboard | It is where a manager already goes to see results, and where "open the next one" naturally follows "read the last one". A separate sessions page would be a second destination with one control on it. |
| Close is confirmed, open is not | Closing is irreversible and ends collection. Opening is recoverable — the service already closes any existing open session when a new one opens. |
| Post-close state is explicit, not polled | Aggregates materialise on a scheduler tick at least 30s after close (`scheduler.service.ts:75-102`), so the dashboard would show nothing immediately after a close. It says so, rather than polling and appearing broken. |
| Legend plus data table, not focusable SVG points | `role="img"` hides the SVG's children from assistive technology; making circles focusable means removing it and hand-building a widget. A visible legend plus a real `<table>` gives every user the values, and satisfies 1.4.13 by not depending on hover. |
| Guard at member-add *and* at sign-in | Rejecting the addition stops ambiguity being created and gives the manager an actionable error. The sign-in guard defends rows that predate the guard, and is the one that prevents a wrong-team session. |
| `findAllByEmail` rather than ordering `findFirst` | Deterministic-by-ordering would still sign the person into one arbitrary team. The service must be able to see that there is more than one. |

## Architecture

### Navigation shell

```
src/app/teams/[teamId]/layout.tsx   ─┐
src/app/me/layout.tsx               ─┴─→ <AppShell> → GET /api/me → <nav>
```

`AppShell` (`src/components/app-shell/app-shell.tsx`) is a client component. It
fetches `/api/me` once on mount and renders:

- a skip link (`href="#main"`), first in tab order
- `<nav aria-label="Main">` containing Dashboard, Settings, Audit log (Delivery
  Manager only), and Profile
- the active link marked with `aria-current="page"` and a non-colour visual
  treatment (weight plus a left border on narrow viewports, an underline on wide)
- a sign-out button posting to `/api/auth/logout`, then navigating to `/`
- `<main id="main">{children}</main>`

While `/api/me` is in flight the shell renders the landmark and the Profile link
only. It does not render team-scoped links with a guessed id. If `/api/me`
returns 401 the shell renders nothing and lets the page handle its own
unauthenticated state, which is the existing behaviour.

Active detection uses `usePathname()`. Matching is by segment, so
`/teams/x/dashboard` marks Dashboard and nothing else.

### `/api/me` additions

```jsonc
{
  // ...existing member fields, slackLink
  "team": { "id": "…", "name": "…" },
  "roles": ["delivery_manager"]
}
```

Resolved from `repos.team.findById(member.teamId)` and
`repos.teamMemberRole.findByMemberAndTeam(member.id, member.teamId)`. The route
stays thin; no new service.

`src/tests/mocks/handlers.ts` has no `/api/me` handler today. If the shell's
tests need one, it is written against this shape and kept in step with the route
in the same commit. A mock that outlives the contract it imitates is how UI tests
pass while the page is broken.

### Session lifecycle

A `SessionLifecyclePanel` client component on the dashboard, rendered only when
`roles` includes `delivery_manager`.

```
GET  /api/teams/{teamId}/sessions            → list, existing
POST /api/teams/{teamId}/sessions            → open, existing (201)
PATCH /api/teams/{teamId}/sessions/{id}      → close, existing ({ closed: true })
```

No new endpoints. The panel derives Session_State from the session list:

| Condition | State shown | Control |
|---|---|---|
| an open session exists | Collecting responses, closes {scheduledCloseAt} | Close (confirm) |
| no open session, latest closed has aggregates | Last check closed {actualCloseAt} | Open |
| no open session, latest closed has none | Closed — results appear within a minute | Open |
| no sessions at all | No health check has run yet | Open |

Aggregate presence comes from the trends response the dashboard already fetches,
matched by session id — no extra request.

Response counts for the open session come from the existing participation
endpoint (`/api/teams/{teamId}/sessions/{sessionId}/participation`).

On success the panel refetches sessions and trends rather than reloading the
page. On failure it surfaces `error.message` from the response body and leaves
the displayed state untouched.

Close confirmation is a native `<dialog>` with an explicit "Close the health
check" button and a Cancel that returns focus to the trigger. Not
`window.confirm`, which is unstyleable and unassertable.

**As built — two things the design did not anticipate.**

*jsdom 29.1.1 implements neither `showModal()` nor the `cancel` event.* The
component calls `showModal()` where it exists and sets the `open` property where
it does not, so the confirmation stays assertable in jsdom while real browsers
get the top layer, the backdrop and an inert background. Escape is handled
explicitly as well as through `cancel`, because a dialog opened without
`showModal()` gets no Escape handling from the browser at all.

*Focus restoration has to close the dialog first.* While a modal is open,
everything outside the top layer is inert, so focusing the trigger before
closing is silently ignored and the keyboard user is left on `body`. Found by
running it in a browser; jsdom has no top layer and cannot catch it. The browser
test asserts the dialog matches `:modal`, so a regression to a non-modal
`<dialog open>` — identical in a screenshot, entirely different for keyboard
users — fails.

### Dashboard changes

**Chart** — `TrendChart` gains a caption and a legend, and emits a data table.

```
<figure aria-labelledby="trend-chart-caption">
  <figcaption id="trend-chart-caption">Average score per question across the last {n} closed sessions…</figcaption>
  <svg aria-hidden="true">…</svg>
  <ul aria-label="Questions plotted">swatch + question name, one per line</ul>
  <table aria-labelledby="trend-chart-caption">…</table>
</figure>
```

The legend carries the question name next to its colour, so the mapping does not
depend on colour perception. The table has a row per session and a column per
question, each cell giving score and response count — the same values a tooltip
would show, reachable by keyboard.

**As built — two changes from the sketch above.**

*The SVG is `aria-hidden`, not `role="img"`.* Keeping `role="img"` would have
left the drawing announced as a picture with a label, immediately followed by a
table saying the same thing — the caption read twice before any data. Since the
table carries everything, the drawing has nothing left to contribute to a screen
reader.

*The table is not behind a `<details>`.* A table hidden by default is one more
thing to discover, and this one is small enough to sit in the page. A cell for a
question a session did not record reads "Not answered" rather than being blank,
so a gap is distinguishable from a zero.

**Latest Session panel** — replaced. It currently lists response counts only,
under a heading that promises more. The replacement shows, per question: average
score, change from the previous session with direction stated in text
(`+0.4 higher`, not an arrow alone), and response count. Suppressed values under
the anonymity threshold say so.

**Pluralisation** — a `pluralise(count, singular, plural?)` helper in
`src/lib/format.ts`, used everywhere a count meets a noun. `1 response`, not
`1 responses`.

**Question disclosure** — `QuestionDetailView`'s question buttons gain
`aria-expanded`, `aria-controls` pointing at the panel's id, and a chevron. The
panel gets a stable id derived from the question id. The E2E suite then locates
it with `getByRole('region')` / `aria-controls` instead of `div.border-l-2`,
which is a Tailwind class that any restyle silently breaks.

### First-run guidance

A `GuidanceBanner` component driven by conditions the pages already have data for:

| Condition | Where | Message |
|---|---|---|
| `members.length <= 1` | settings | Add the rest of your team below |
| no schedule configured | settings | Choose a schedule below; without one you open each check yourself |
| no closed sessions | dashboard | Trends appear once a check closes |
| exactly one closed session | dashboard | A second check is what makes a trend |
| anonymous privacy mode | dashboard | Hidden is not the same as unanswered |

Each condition is evaluated from loaded data, so guidance disappears on the next
render once satisfied. No dismissal state is persisted: a banner that can be
dismissed while still true is a banner that stops telling the truth. A test
asserts the banner renders no button at all, so a dismiss control cannot appear
by accident.

The existing "More data needed" copy stays as the heading for the one-session
case; the guidance adds the next action.

**As built — members and schedule guidance is on settings only**, not on both
pages as the table originally said. The dashboard would have needed two extra
requests to know whether to say anything, about work the manager has to leave
the page to do. Each page now advises on what it can itself act on, and the
messages point down the page rather than carrying a link elsewhere.

The no-sessions message also varies by role: a Delivery Manager is pointed at
the open control above it, a contributor is told trends appear after a close
without being sent after a button they do not have.

### Ambiguous identity guard

**Repository** — `TeamMemberRepository.findAllByEmail(email): Promise<TeamMember[]>`
added to the interface, the Prisma implementation (`findMany`), and the in-memory
fake. `findByEmail` remains for callers that legitimately want "the one", but
`AuthService` stops using it.

**Sign-in** (`auth.service.ts:158`):

```
const members = await teamMemberRepo.findAllByEmail(email);
if (members.length > 1) → log, return (no magic link, no genesis record)
if (members.length === 1) → existing member path
if (members.length === 0) → existing genesis path
```

`requestMagicLink` already returns `void` unconditionally, so the HTTP response
is unchanged and enumeration resistance is preserved for free. The log line
carries the email and the team ids, because an operator resolving this needs to
know which rows collide.

**Member addition** (`team.service.addMember`) — before creating, call
`findAllByEmail`. If any returned member belongs to a different team, throw
`ConflictError` with a message naming the situation:

> That email already belongs to a member of another team. A person can belong to
> only one team in this tool.

Thrown before the member insert and before the `member_added` audit write, so a
rejected addition leaves nothing behind. `withErrorHandling` maps `ConflictError`
to 409, which the members section already surfaces.

The empty-email case is exempt: `email` is optional on `TeamMember` and multiple
members may have none.

## Correctness Properties

| # | Property | Validates |
|---|---|---|
| 1 | For any set of members, the shell renders a Delivery-Manager-only link if and only if the fetched roles contain `delivery_manager` | 1.3 |
| 2 | For any session list, exactly one Session_State is derivable, and the offered control matches it | 2.1, 2.3, 2.4, 2.7 |
| 3 | For any non-negative count, the rendered noun is singular iff the count is 1 | 3.7 |
| 4 | For any email held by two or more members, `requestMagicLink` creates neither a magic link nor a pending genesis record | 5.4 |
| 5 | For any email held by a member of another team, `addMember` throws and the member count is unchanged | 5.1, 5.2 |
| 6 | `requestMagicLink` returns without throwing for every input, ambiguous or not | 5.6 |

## Testing Strategy

Per tier, chosen by what only that tier can catch:

- **Unit** — the guard in `auth.service` and `team.service` against in-memory
  fakes; `pluralise`; Session_State derivation as a pure function of the session
  and aggregate lists.
- **Property (fast-check)** — properties 3, 4, 5, 6 above. Property 6 matters
  because the anti-enumeration guarantee is a claim about *every* input.
- **Component (jsdom + Testing Library)** — the shell's role-conditional links,
  the lifecycle panel's four states, guidance appearing and disappearing, the
  disclosure's `aria-expanded` transitions. Assert what the user sees and what
  assistive technology is told, not that a fetch was issued.
- **Integration (real SQLite file)** — `findAllByEmail` returning two rows for one
  email across two teams. The constraint being tested is a database constraint;
  an in-memory fake cannot prove the schema permits what the guard defends
  against.
- **E2E (Playwright)** — open and close driven through the UI, replacing the API
  calls in `journey.spec.ts`; the disclosure located by accessible relationship;
  axe over the shell, the lifecycle panel, the confirmation dialog, and each
  guidance state.
- **Manual keyboard pass** — tab through the shell and the lifecycle panel
  including the dialog, with the result recorded in the tasks document. Axe
  catches roughly a third to a half of WCAG issues and cannot tell whether focus
  order makes sense or whether a dialog traps focus correctly.

Two traps this spec is specifically exposed to:

1. **A green test for a dialog that never opened.** Assert the confirmation's
   heading is visible and that no close request was made until the confirm
   button was pressed — not that a click handler ran.
2. **A guidance banner asserted by its own test id.** Assert the text a manager
   reads, so copy that regresses to a placeholder fails.

## What implementation taught

Things the design had no place for, recorded because they will apply to the next
milestone too.

**Dates cross JSON as strings.** `HealthCheckSession` is serialised straight to
JSON, so the panel receives ISO strings where the state derivation compares
`Date`s. The MSW handlers mirror that exactly: a mock returning `Date` objects
would have let the component skip parsing and still pass, while the real page
threw on the first comparison. That is the same shape as the audit log crash
found by using the app, one layer down.

**Pin the locale of any formatted date.** `toLocaleDateString(undefined, …)`
follows the machine's locale, so the same close time read "28 August 2026"
locally and "August 28, 2026" on CI. Windows ignores `LANG`, so no local run
could have reproduced it. Both the panel and the chart now pin `en-GB`.

*Still open:* dates render in the **viewer's** timezone, which is right for a
person reading them but not necessarily right for the team. A check closing at
23:30 UTC falls on different days either side of midnight, and the team already
stores a timezone. Plumbing it through needs a decision about whose day a close
time belongs to.

**One tick, one clock.** The scheduler reconciled against its injected clock but
stamped `scheduledCloseAt` from the wall clock, because it took the session
service from the container. Harmless in production, where both are real; it made
the closing-reminder tests pass or fail according to the day and hour the suite
ran. Any route driven by an injectable clock should build its collaborators with
that clock.

**Two test flakes came from tests growing past their budget**, not from the code
under test. A property that rendered a component and awaited a fetch a hundred
times, and a suite paying a route's cold module load inside its first timed
test. Both only appeared once the suite passed roughly 1300 tests. Properties
belong on pure functions where one exists; module loading belongs in a hook.

**Assert absences against a rendered page.** `queryByRole(...)` on a component
that has not finished loading passes for the wrong reason. Every negative
assertion in this milestone waits for something that is always present first.

## Out of Scope

- Multi-team membership. Requirement 5 makes the single-team assumption safe and
  visible; supporting it properly needs an identity model above `TeamMember`,
  a team switcher, and a review of every team-scoped query. Its own spec.
- Design system, dark mode, and theming.
- A sessions history page. The lifecycle panel shows the current state; history
  is available through export.
- Editing or reopening a closed session.
