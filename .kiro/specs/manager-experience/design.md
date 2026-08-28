# Technical Design Document: Manager Experience

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

### Dashboard changes

**Chart** — `TrendChart` gains a caption and a legend, and emits a data table.

```
<figure>
  <figcaption>Average score per question, most recent {n} sessions</figcaption>
  <svg role="img" aria-label="…" aria-describedby="trend-table">…</svg>
  <ul>legend: swatch + question name, one per line</ul>
  <details><summary>Show data table</summary><table id="trend-table">…</table></details>
</figure>
```

The legend carries the question name next to its colour, so the mapping does not
depend on colour perception. The table has a row per session and a column per
question, each cell giving score and response count — the same values a tooltip
would show, reachable by keyboard.

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
| `members.length <= 1` | settings, dashboard | Add your team, link to Members |
| no schedule configured | settings, dashboard | Configure when checks open and close |
| `sessions.length === 0` closed | dashboard | Trends appear once a check closes |
| exactly one closed session | dashboard | Replaces "More data needed" with what to do next |
| anonymous privacy mode | dashboard | Detail is hidden below {threshold} responses |

Each condition is evaluated from loaded data, so guidance disappears on the next
render once satisfied. No dismissal state is persisted: a banner that can be
dismissed while still true is a banner that stops telling the truth.

The existing "More data needed" copy stays as the heading for the one-session
case; the guidance adds the next action.

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

## Out of Scope

- Multi-team membership. Requirement 5 makes the single-team assumption safe and
  visible; supporting it properly needs an identity model above `TeamMember`,
  a team switcher, and a review of every team-scoped query. Its own spec.
- Design system, dark mode, and theming.
- A sessions history page. The lifecycle panel shows the current state; history
  is available through export.
- Editing or reopening a closed session.
