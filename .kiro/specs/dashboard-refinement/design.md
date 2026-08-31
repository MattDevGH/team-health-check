# Technical Design Document: Dashboard Refinement

## Overview

Three defects, a chart that misrepresents time and depends on colour, naming
that calls a theme a question while hiding the real one, and settings a
colleague cannot interpret. Plus two new capabilities: filtering the chart, and
removing a session that should not count.

Almost all of it is presentation. The exceptions are one new field on an
existing response, and session removal — which touches data and is the only part
that needs a decision before it can be built.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Time-proportional x-axis from `closedAt` | A trend line's slope is a claim about rate of change. Even spacing makes a day-apart pair and a month-apart pair look identical. |
| Dash pattern **and** marker shape per series | Two redundant non-colour channels. Dashes read at a glance on screen; marker shapes survive a line being short or steep. Either alone is fragile. |
| Question catalogue added to the trends response | The dashboard already fetches trends. A request per question theme would be five round trips for five fixed rows; a separate `/api/questions` route would be a second request for data that never changes. |
| Actor names resolved from the members the audit page already loads | The audit log stores ids, and must keep storing ids — it is append-only history, and a name at the time of writing would go stale. Resolution is presentation. |
| Filtering held in component state, not the URL | Requirement 8.4 asks for it not to persist. State that survives a reload is state a manager has to remember they set. |
| Session removal as **exclusion**, not deletion | Recommended, not settled — see below. |
| "Question theme" as the user-facing term | Agreed 2026-08-31. Copy only: no stored value, API field or identifier changes. `Question.title` stays `title`; the API keeps calling them questions, because that is what the model is. |

## Architecture

### The trends response gains a catalogue

```jsonc
{
  "sessions": [ /* unchanged */ ],
  "trendDistribution": [ /* unchanged */ ],
  "privacyMode": "attributed",
  // New: the five fixed questions, so the dashboard can name every theme —
  // including one nobody answered — and show the question behind it
  "questions": [
    { "id": "q-delivering-value", "title": "Delivering Value",
      "description": "How well is the team delivering value to users and stakeholders?" }
  ]
}
```

This is what makes Requirements 3 and 4 possible at all. Today the dashboard
derives its list from the union of ids that appear in the aggregates, so a
question theme nobody has ever answered does not exist as far as the page is
concerned — which is exactly the silence Requirement 4 objects to.

`questionRepo.findAll()` already exists; nothing new is needed below the route.

### Chart geometry

```
x(session) = PADDING_LEFT + PLOT_WIDTH × (closedAt − earliest) / (latest − earliest)
```

Two edge cases the current index-based code cannot hit:

- **One session, or all sessions closed at the same instant.** The denominator
  is zero; the point is centred, as it is today for a single session.
- **Two sessions closed minutes apart.** Their markers overlap. Acceptable — it
  is the truth — but the data table remains the readable account, which is why
  Requirement 1.5 pins it to chronological order regardless.

Axis labels become dates rather than positions, and the caption says the axis is
time so the spacing is not read as arbitrary.

### Series identity

Each question theme gets a triple: colour, dash pattern, marker shape.

| Series | Dash | Marker |
|---|---|---|
| 1 | solid | circle |
| 2 | dashed | square |
| 3 | dotted | triangle |
| 4 | dash-dot | diamond |
| 5 | long dash | cross |

The legend swatch draws the same dash and marker rather than a plain colour
block, so the legend is readable in greyscale and the mapping does not depend on
hue at all. This is the same reasoning as manager-experience Requirement 3.2,
carried one step further: a legend that names colours still fails if the colours
are indistinguishable.

### Attribution in the audit log

The audit page already loads the team's members. Resolution is a lookup with
four outcomes:

| Stored `userId` | Displayed |
|---|---|
| the reader's own member id | "You" |
| another current member | that member's name |
| `deleted:<hash>` | "A deleted account" |
| anything else unresolved | "A former member" |

`deleted:<hash>` is written by the GDPR data-deletion path and must never be
reversed — it exists precisely so the actor cannot be identified. The unresolved
case covers members removed from the team, whose audit entries survive them.

Stored values do not change: Requirement 6.5 keeps the log append-only.

## Session removal — decided, and deliberately not scheduled

**Outcome (2026-08-31): exclusion is preferred over deletion, and neither is
scheduled.** The need may never arise. Requirement 9 stays on record so that if
it does, this thinking does not have to be repeated.

**Option A — hard delete.** The session, its responses and its aggregates are
removed. Simple, and matches "this never should have existed". But responses are
what team members wrote; deleting them to tidy a chart destroys the only record
that people answered at all, and the audit entry becomes the sole evidence
anything happened.

**Option B — exclusion (recommended).** The session is marked excluded with a
reason. It stops counting everywhere a trend is drawn, but the record and its
responses survive. The dashboard can show an annotated gap — *"3 September:
excluded, conference week"* — which is more honest than a chart that silently
skips a fortnight.

**Option C — exclusion now, deletion later.** Exclusion covers the stated need
(opened in error, invalidated by events). Deletion, if it is ever wanted, is
then a separate action with a GDPR framing rather than a dashboard-tidying one,
alongside the existing member data deletion.

**Chosen: B**, with C as the path if deletion is ever genuinely needed.

Whichever is built, the audit entry carries the reason, the session's close date
and the actor, and remains readable once the session is gone.

### Why the schema change waits

The question was raised of whether to add `excludedAt` and `exclusionReason` now,
while there is no live data, on the assumption that a schema change gets more
expensive later. It does not, here:

- Both columns are **nullable**, and *absent* is a meaningful value — a session
  with no `excludedAt` is simply not excluded. Nothing needs backfilling.
- A nullable `ALTER TABLE ADD COLUMN` is a metadata-only change in SQLite, and
  the same on Turso. It does not rewrite the table, so the row count is
  irrelevant.

Schema changes that get expensive later are the ones requiring a non-null
default, a data transformation, or a table rewrite. This is none of them, so the
cost is identical today and in a year.

There is a cost to adding them early: an `excludedAt` sitting unused in the
schema is a standing invitation to filter on it before anyone has agreed what
exclusion means. The columns arrive with the feature or not at all.

## Correctness Properties

| # | Property | Validates |
|---|---|---|
| 1 | For any set of session dates, x positions are monotonically non-decreasing in `closedAt`, and equal dates give equal positions | 1.1, 1.2 |
| 2 | For any number of sessions from one upward, every plotted point falls inside the plot area | 1.3 |
| 3 | No two series share both a dash pattern and a marker shape | 2.1 |
| 4 | For any session and any question theme, the Latest Session panel renders a row — with a score, a suppression notice, or a no-responses notice, and never two of them | 4.1, 4.2, 4.4 |
| 5 | For any actor id, exactly one attribution is produced, and a raw id is never displayed | 6.1–6.4 |
| 6 | For any subset of hidden series, the data table's contents are unchanged | 8.3 |

## Testing Strategy

- **Unit** — x-position mapping including the zero-range case; actor
  attribution; the Latest Session row states.
- **Property** — properties 1–6 above. Property 1 matters most: it is the one
  that says the chart cannot misrepresent time for *any* set of dates, which is
  the whole point of Requirement 1.
- **Component** — legend toggles and their `aria-pressed` state; the expanded
  question theme showing its question text; explanatory copy present with its
  control.
- **Browser** — axe over each new state; a keyboard-only pass over the legend
  toggles; the chart at 320px.
- **Cross-checking** — any assertion about a plotted value continues to read the
  stored aggregate back from the database rather than trusting the component's
  props, as the dashboard E2E already does.

Two traps this spec is exposed to:

1. **Asserting the dash pattern rather than the distinction.** A test that pins
   `stroke-dasharray="4 2"` asserts what was typed. Property 3 asserts what
   matters: no two series are confusable.
2. **Renaming copy without renaming its tests.** Requirement NFR 2.1 exists
   because a half-renamed suite is one that passes while the page says two
   different things.

## Out of Scope

- Design system, dark mode, theming.
- Tooltips on hover. The data table already gives every value to every user;
  a hover-only affordance would add a pointer-dependent path to information
  that is already available, which is the situation manager-experience
  Requirement 3.4 was written to avoid. Revisit if the table proves too far from
  the chart to be useful.
- Any change to what a team member is asked, or to the scoring scale.
- Session removal implementation, until the decision above is made.
