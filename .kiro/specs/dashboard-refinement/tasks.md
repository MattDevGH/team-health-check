# Implementation Plan: Dashboard Refinement

## Overview

Ordered so the things that are wrong are fixed before the things that are
missing, and the things that unblock sharing this with colleagues come before
the things that are nice to have.

Group 1 is three defects, each small and independent. Group 2 makes the chart
truthful and legible. Group 3 fixes the naming and shows the question a team is
actually asked. Group 4 is explanatory copy — the largest by volume and the one
that most affects whether a colleague can use this unaided. Group 5 is chart
filtering. Group 6 is session removal, which **must not start until the design
document's open decision is settled**.

All tasks follow TDD (Red → Green → Refactor) and one green behaviour per
commit. Update AI_CONTEXT.md and README.md in the commit that changes behaviour,
test coverage, or conventions.

Groups 1, 4 and 5 each end at a checkpoint.

## Tasks

- [ ] 1. Defects found in the manual pass

  - [ ] 1.1 Profile stops rendering a value it does not have
    - Write a failing test: the profile page renders no empty "Privacy mode" line
    - `GET /api/me` returns a `TeamMember`, which has no `privacyMode`; the field belongs to `Team`
    - Decide with the user: remove it, or show the team's mode read-only and labelled as the team's
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 1.2 Audit log attributes changes to people
    - Write failing tests for each of the four outcomes: the reader, another current member, a former member, `deleted:<hash>`
    - **Property 5: for any actor id, exactly one attribution is produced and a raw id is never displayed**
    - Resolution is presentation only; stored values do not change
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 1.3 Absent topics said out loud
    - Write failing tests: a topic with no responses appears in the Latest Session panel marked as unanswered, and appears in the expanded history marked as unanswered
    - **Property 4: every topic yields exactly one row state — score, suppressed, or unanswered**
    - Suppressed and unanswered must not share wording: they are different facts
    - Depends on task 3.1, which is what makes the full topic list available
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 2. Checkpoint — defects
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.

- [ ] 3. A chart that tells the truth

  - [ ] 3.1 Serve the topic catalogue with the trends response
    - Write failing route tests: the response carries every topic with its id, title and description, whether or not that topic has aggregates
    - Uses the existing `questionRepo.findAll()`; no new repository work
    - Update the MSW handler in the same commit — a mock that lags this contract is how the audit log page came to crash
    - _Requirements: 3.3, 4.1_

  - [ ] 3.2 Position sessions by when they closed
    - Write failing unit tests for the x-position mapping, including one session, two sessions closed at the same instant, and an uneven spread
    - **Property 1: x positions are monotonically non-decreasing in `closedAt`, and equal dates give equal positions**
    - **Property 2: for any session count from one upward, every point falls inside the plot area**
    - Axis labels become dates; the caption says the axis is time
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 3.3 Distinguish series without colour
    - Write failing tests: each series carries a dash pattern and a marker shape, and the legend swatch carries the same
    - **Property 3: no two series share both a dash pattern and a marker shape**
    - Assert the distinction, not the specific `stroke-dasharray` — pinning the literal value asserts what was typed
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ] 3.4 Lay the legend out predictably
    - One row if the entries fit, one per line otherwise; never four and an orphan
    - Verify at 1280px, 375px and 320px
    - _Requirements: 2.4_

  - [ ] 3.5 Make the data table read as a table
    - Header row visually distinct from the body
    - _Requirements: 1.5_

  - [ ] 3.6 Accessibility pass over the chart
    - axe over the chart at 1280px and 320px
    - Confirm the legend and table remain legible with colour removed
    - _Requirements: NFR 1.1, 2.5_

- [ ] 4. Topics, and the question behind them

  - [ ] 4.1 Rename the user-facing term
    - Decide the term with the user: "topic", "theme", "question theme"
    - Update every user-facing string, and **every test asserting the old wording, in the same commit**
    - No stored value, API field or identifier changes
    - _Requirements: 3.1, 3.4, NFR 2.1_

  - [ ] 4.2 Show the question a team member was asked
    - Write a failing test: expanding a topic displays its `description`
    - _Requirements: 3.2_

  - [ ] 4.3 Make the disclosure obvious
    - The chevron alone was reported as too subtle; add text such as "Show responses"
    - Keep `aria-expanded` and `aria-controls` as they are — this is about what a sighted user notices, not what is announced
    - _Requirements: 3.2_

- [ ] 5. Explanatory copy

  - [ ] 5.1 Explain Privacy Mode, including the anonymity threshold
    - _Requirements: 5.1, 5.7_

  - [ ] 5.2 Explain the Schedule, and what happens without one
    - _Requirements: 5.2, 5.7_

  - [ ] 5.3 Explain the Slack Delivery Window
    - _Requirements: 5.3, 5.7_

  - [ ] 5.4 Explain roles, and what "Slack not linked" means
    - Include how a member resolves it: the pairing code on their profile
    - _Requirements: 5.4, 5.5, 5.7_

  - [ ] 5.5 Explain the Trend Indicators panel
    - These are members' own assessments of direction, not a calculated trend. One respondent tagging a topic "improving" is what produces "Improving: 1"
    - _Requirements: 5.6, 5.7_

  - [ ] 5.6 Assert the copy exists where its control is
    - Tests assert the text a manager reads, not a test id
    - _Requirements: 5.7_

- [ ] 6. Checkpoint — legibility and copy
  - Full suite, `tsc --noEmit`, lint, build, E2E. This is the natural point to
    share the app with a colleague and see whether it survives someone who was
    not in these conversations.

- [ ] 7. Filtering the chart

  - [ ] 7.1 Toggle a series from the legend
    - Write failing tests: activating a legend entry hides that line and its markers; activating it again restores them; `aria-pressed` reflects the state
    - **Property 6: for any subset of hidden series, the data table's contents are unchanged**
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 7.2 Handle the empty chart
    - Hiding every series says so rather than rendering an empty grid
    - _Requirements: 8.5_

  - [ ] 7.3 Do not persist the filter
    - A manager returning to the dashboard sees the whole picture
    - _Requirements: 8.4_

  - [ ] 7.4 Accessibility pass over filtering
    - Keyboard-only operation of every toggle; axe over a partially filtered chart
    - _Requirements: NFR 1.1, 1.2_

- [ ] 8. Removing a session — **blocked on a decision**

  Do not start until the design document's open question is settled: whether
  removal is deletion or exclusion, what becomes of the responses underneath,
  and whether an excluded session shows as an annotated gap.

  The recommendation is exclusion, with hard deletion left to a future GDPR
  framing rather than a dashboard-tidying one. The user has asked to discuss
  this before it is built.

  - [ ] 8.1 Record the decision in the design document before writing code
  - [ ] 8.2 Schema and migration, if exclusion is chosen
  - [ ] 8.3 Service: remove a session with a mandatory reason, audited atomically
    - Reject an empty reason
    - The audit entry carries the reason, the session's close date and the actor, and survives the session
    - _Requirements: 9.2, 9.3, 9.4_
  - [ ] 8.4 Route: Delivery Manager only
    - _Requirements: 9.1_
  - [ ] 8.5 UI: confirmation naming what is being removed, reason required
    - _Requirements: 9.5_
  - [ ] 8.6 Every view stops counting a removed session
    - Chart, data table, Latest Session panel, topic history
    - Falling below two closed sessions returns the dashboard to its insufficient-data state rather than a broken chart
    - _Requirements: 9.6, 9.7_

- [ ] 9. Reconcile and merge
  - Update requirements/design/tasks to match what was built, including any decision that changed during implementation
  - Update README.md and AI_CONTEXT.md
  - Run every gate, push, and merge through a green PR

## Where this came from

Every requirement traces to a manual pass over the live application on
2026-08-30, against real team data. None of it was found by a test, and none of
it failed one — the defects in group 1 sat behind green suites in exactly the
way `AGENTS.md` warns about.

Two findings are worth remembering beyond this spec:

- **The dashboard could not name a topic nobody had answered**, because it
  derived its topic list from the data rather than from the catalogue. Absence
  was unrepresentable, so it was invisible.
- **The literal question text has existed in the database since the first
  migration** and has never been shown on the dashboard. Nothing failed; it
  simply was not asked for.
