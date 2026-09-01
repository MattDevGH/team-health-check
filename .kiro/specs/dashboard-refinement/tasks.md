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

Groups 1 and 5 each end at a checkpoint.

## Tasks

- [x] 1. Defects found in the manual pass

  - [x] 1.1 Profile stops rendering a value it does not have
    - Write a failing test: the profile page renders no empty "Privacy mode" line
    - `GET /api/me` returns a `TeamMember`, which has no `privacyMode`; the field belongs to `Team`
    - Decide with the user: remove it, or show the team's mode read-only and labelled as the team's
    - _Requirements: 7.1, 7.2, 7.3_
    - **Done — shown, not removed.** Privacy mode decides whether a member's
      individual answers can be attributed to them, which is exactly what the
      person answering needs to know. Removing the line would have deleted a
      legitimate question rather than answered it.
    - `GET /api/me` now returns `team.privacyMode`. The copy is written from the
      answerer's point of view — "your individual answers are not shown to your
      delivery manager" — rather than describing a mode name, and says who sets
      it.
    - **The mock was the reason this shipped.** `profile-page.test.tsx` mocked
      `/api/me` with a top-level `privacyMode` the route has never sent, so the
      page read `profile.privacyMode`, rendered nothing, and the test stayed
      green. The mock now mirrors the real response. This is the third instance
      of the pattern in `AGENTS.md`, and the second found by using the app.
    - A test covers the unresolvable-team case rendering *nothing* rather than a
      label with a blank after it — the shape of the original defect.

  - [x] 1.2 Audit log attributes changes to people
    - Write failing tests for each of the four outcomes: the reader, another current member, a former member, `deleted:<hash>`
    - **Property 5: for any actor id, exactly one attribution is produced and a raw id is never displayed**
    - Resolution is presentation only; stored values do not change
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - **Done.** Resolved **server-side**, not client-side as the design assumed.
      The design said "the members the audit page already loads" — it does not;
      it loads only the log. Resolving in the service keeps it to one request
      and means the client never receives an id it might render by accident.
    - `getLog` takes the reader's id, so "You" needs no second request for the
      client's own identity. Members are read **once per page**, not once per
      entry — a log of fifty changes by two people is still two people, and a
      test counts the lookups.
    - Erasure is checked **before** the name lookup, so a `deleted:<hash>` value
      can never resolve to a person. The hash exists precisely so the actor
      cannot be identified; resolving it would defeat the erasure it records.
    - Stored values are untouched, asserted directly: the log stays append-only
      and this is presentation only.
    - No system actor is written to the audit log today, so Requirement 6.4's
      "system process" case is covered by the unresolved path rather than a
      branch of its own.

  - [x] 1.3 Absent question themes said out loud
    - Write failing tests: a question theme with no responses appears in the Latest Session panel marked as unanswered, and appears in the expanded history marked as unanswered
    - **Property 4: every question theme yields exactly one row state — score, suppressed, or unanswered**
    - Suppressed and unanswered must not share wording: they are different facts
    - Depends on task 3.1, which is what makes the full list available
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
    - **Done, after pulling 3.1 forward** — the catalogue is what makes absence
      representable, so it had to land first. The task order in this plan put
      3.1 later; the dependency note was right and the ordering was not.
    - "No responses" and "Hidden until 3 people have answered" are deliberately
      different sentences. One means silence; the other means people answered
      and there were too few to show safely. A test asserts the unanswered row
      does *not* carry the suppression wording.
    - The catalogue prop is optional and the panel falls back to the answered
      themes without it, so the page still renders against a trends response
      that predates it.

- [ ] 2. Checkpoint — defects
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.

- [x] 3. A chart that tells the truth

  - [x] 3.1 Serve the question catalogue with the trends response
    - Write failing route tests: the response carries every question with its id, title and description, whether or not it has aggregates
    - The API field is `questions`, because that is what the model is; "question theme" is the user-facing term for the title
    - **Done, pulled forward from group 3** because task 1.3 depends on it.
    - The question repository is read-only with a fixed five-row list, so the
      test uses the canonical set rather than seeding one — there is no
      `create` to call, and inventing one would have been a fixture describing
      a repository that does not exist.
    - Uses the existing `questionRepo.findAll()`; no new repository work
    - Update the MSW handler in the same commit — a mock that lags this contract is how the audit log page came to crash
    - _Requirements: 3.3, 4.1_

  - [x] 3.2 Position sessions by when they closed
    - Write failing unit tests for the x-position mapping, including one session, two sessions closed at the same instant, and an uneven spread
    - **Property 1: x positions are monotonically non-decreasing in `closedAt`, and equal dates give equal positions**
    - **Property 2: for any session count from one upward, every point falls inside the plot area**
    - Axis labels become dates; the caption says the axis is time
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
    - **Done.** The mapping lives in `chart-geometry.ts`, apart from the
      component, so the cases a rendered chart makes awkward to reach can be
      exercised directly: one session, and several closed at the same instant.
      Both would otherwise divide by a zero range.
    - **Property 1 asserts more than monotonicity.** A third property checks
      that the *ratio* of gaps is preserved — a point one-tenth of the way
      through the elapsed time sits one-tenth of the way across the plot. That
      is what makes a slope mean anything; monotonic-but-arbitrary spacing
      would satisfy the first two properties and still misrepresent the rate.
    - The caption says sessions are spaced by the time between them. Without
      it a reader cannot tell even-looking spacing from even intervals.

  - [x] 3.3 Distinguish series without colour
    - Write failing tests: each series carries a dash pattern and a marker shape, and the legend swatch carries the same
    - **Property 3: no two series share both a dash pattern and a marker shape**
    - Assert the distinction, not the specific `stroke-dasharray` — pinning the literal value asserts what was typed
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
    - **Done.** Each series carries colour, a dash pattern and a marker shape.
      Two of the three survive colour being removed entirely: dashes read at a
      glance across a long line, marker shapes stay legible where a line is
      short or steep and a dash has no room to repeat. Either alone is fragile.
    - The legend swatch draws the same dash and marker as the line it names,
      rather than a colour block — so the legend itself works in greyscale.
      A legend that only names colours still fails when the colours are the
      problem, which is exactly what was reported for blue against purple.
    - **The tests assert the distinction, not the values.** Property 3 checks
      no two series share both a dash and a marker; the component tests check
      the rendered dashes are all different. Pinning `stroke-dasharray="6 3"`
      would assert what was typed and keep passing if two series collided.

  - [x] 3.4 Lay the legend out predictably
    - One row if the entries fit, one per line otherwise; never four and an orphan
    - Verify at 1280px, 375px and 320px
    - _Requirements: 2.4_
    - **Done.** A CSS grid rather than a wrapping flex row. Wrapping produced
      four entries and a lone fifth, which reads as a mistake; the grid gives
      one column per entry where they fit and one per line where they do not,
      so the arrangement always looks deliberate.

  - [x] 3.5 Make the data table read as a table
    - Header row visually distinct from the body
    - _Requirements: 1.5_
    - **Done.** A tinted background, a heavier rule beneath, and semibold
      labels. The header previously shared the body’s weight and colour, so
      the table read as an undifferentiated block.

  - [x] 3.6 Accessibility pass over the chart
    - axe over the chart at 1280px and 320px
    - Confirm the legend and table remain legible with colour removed
    - _Requirements: NFR 1.1, 2.5_
    - **Done, and it found a real defect.** Axe reported
      `scrollable-region-focusable` on both data tables at 320px: they scroll
      horizontally, but the scroll container was not reachable by keyboard, so
      a keyboard user could not scroll them at all. Both now carry
      `role="region"`, a name and `tabindex="0"`.
    - **The defect predates this milestone.** The tables arrived with
      manager-experience 5.3, and the 320px audit added there covered the
      dashboard but not a viewport narrow enough to make them overflow. It
      only bites at the widths where the content actually exceeds the box.
    - Naming the inner region mattered: the first name collided with the
      section around it, so `getByRole("region", { name: /latest session/i })`
      matched two elements and two existing tests broke. Renamed rather than
      loosening the queries.

- [x] 4. Question themes, and the question behind them

  - [x] 4.1 Rename the user-facing term to **question theme**
    - Term agreed 2026-08-31: clearer and more descriptive than "topic" or "theme" alone
    - Update every user-facing string, and **every test asserting the old wording, in the same commit**
    - No stored value, API field or identifier changes
    - _Requirements: 3.1, 3.4, NFR 2.1_
    - **Done.** "Question themes" as the drill-down heading, "Question theme"
      as the Latest Session column, "Question themes plotted" as the legend,
      and "average score per question theme" in the chart caption.
    - Every test asserting the old wording was updated in the same commit,
      including the E2E legend lookup. A half-renamed suite passes while the
      page says two different things.
    - Nothing stored changed: `Question.title` is still `title`, the API still
      returns `questions`, and no identifier moved.

  - [x] 4.2 Show the question a team member was asked
    - Write a failing test: expanding a question theme displays its `description`
    - _Requirements: 3.2_
    - **Done.** The question text has been in the database since the first
      migration and was displayed nowhere — a manager read a score without
      seeing what it was a score of.
    - The drill-down now lists themes from the catalogue rather than from the
      aggregates, so a theme nobody has ever answered still appears.

  - [x] 4.3 Make the disclosure obvious
    - The chevron alone was reported as too subtle; add text such as "Show responses"
    - Keep `aria-expanded` and `aria-controls` as they are — this is about what a sighted user notices, not what is announced
    - _Requirements: 3.2_
    - **Done.** "Show responses" / "Hide responses" beside a larger chevron.
      Both are `aria-hidden`: assistive technology is already told the same
      thing by `aria-expanded`, and repeating it would announce the state
      twice.

- [x] 5. Explanatory copy

  - [x] 5.1 Explain Privacy Mode, including the anonymity threshold
    - _Requirements: 5.1, 5.7_

  - [x] 5.2 Explain the Schedule, and what happens without one
    - _Requirements: 5.2, 5.7_

  - [x] 5.3 Explain the Slack Delivery Window
    - _Requirements: 5.3, 5.7_

  - [x] 5.4 Explain roles, and what "Slack not linked" means
    - Include how a member resolves it: the pairing code on their profile
    - _Requirements: 5.4, 5.5, 5.7_

  - [x] 5.5 Explain the Trend Indicators panel
    - These are members' own assessments of direction, not a calculated trend. One respondent tagging a question theme "improving" is what produces "Improving: 1"
    - _Requirements: 5.6, 5.7_

  - [x] 5.6 Assert the copy exists where its control is
    - Tests assert the text a manager reads, not a test id
    - _Requirements: 5.7_
    - **Done.** Copy sits with each control rather than on a help page, and
      is written for someone who was not present when this was built.
    - Each explanation says what the setting does **and what happens without
      it**, which is the half usually missing: the schedule section says you
      open checks yourself without one, and the Slack window says answering
      through the web link is never restricted — the distinction that stops a
      delivery window being read as a blackout.
    - "Slack not linked" now says the member can still answer everything, and
      that only they can resolve it, with the pairing code on their own
      profile. It read as a fault to be fixed by the manager.
    - The trend indicators panel says the counts are what people chose, not a
      trend calculated from the scores. That was the specific misreading
      reported.
    - **Three existing privacy-mode tests broke and were right to.** They used
      `getByText(/anonymous/i)` as a page-loaded signal, which the new
      explanation also matches. Scoped to the current-mode readout rather than
      loosened — they were asserting page load, and now say so.

- [x] 6. Checkpoint — legibility and copy
  - Full suite, `tsc --noEmit`, lint, build, E2E. This is the natural point to
    share the app with a colleague and see whether it survives someone who was
    not in these conversations.
  - **Gates:** 1366 Vitest tests across 166 files, `tsc --noEmit`, lint with
    zero warnings, production build, 55 Playwright tests with zero skips, and
    `git diff --check`.
  - **One real accessibility defect found, and it predates this milestone.**
    Axe reported `scrollable-region-focusable` on both data tables at 320px:
    they scroll horizontally but the container was not keyboard-reachable, so
    a keyboard user could not scroll them at all. The tables arrived with
    manager-experience 5.3, whose 320px audit covered the dashboard but not a
    width narrow enough to make them overflow.
  - **Five existing tests broke across this group and every one was right to.**
    Two asserted a legend name that changed; three used a word as a
    page-loaded signal that new explanatory copy also contains. Each was made
    more specific rather than looser.
  - Ready for a colleague to try. Groups 7 (chart filtering) and 8 (reconcile)
    remain.

- [x] 7. Filtering the chart

  - [x] 7.1 Toggle a series from the legend
    - Write failing tests: activating a legend entry hides that line and its markers; activating it again restores them; `aria-pressed` reflects the state
    - **Property 6: for any subset of hidden series, the data table's contents are unchanged**
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 7.2 Handle the empty chart
    - Hiding every series says so rather than rendering an empty grid
    - _Requirements: 8.5_

  - [x] 7.3 Do not persist the filter
    - A manager returning to the dashboard sees the whole picture
    - _Requirements: 8.4_

  - [x] 7.4 Accessibility pass over filtering
    - Keyboard-only operation of every toggle; axe over a partially filtered chart
    - _Requirements: NFR 1.1, 1.2_
    - **Done.** Legend entries are toggles carrying `aria-pressed`, driven in
      the browser by real key presses so a control reachable only by mouse
      would fail.
    - Hiding a series changes the drawing only. Property 6 and a component
      test both assert the data table is untouched: filtering can remove a
      line from the picture, never a value from the page.
    - Hiding everything says so. An empty grid reads as missing data rather
      than as a choice the reader made a moment ago.
    - State is held in the component, not the URL. A filter that survives a
      reload is one a manager has to remember they set, and would have them
      reading a partial chart without knowing it.
    - **Two problems this surfaced.** The page now has two controls per
      question theme — a legend toggle and a drill-down trigger — with the same
      accessible name, so six E2E tests became ambiguous. The drill-down is now
      a named region and the queries are scoped to the control they mean.
    - The hidden-series style used `text-gray-400`, which axe measured at
      2.6:1 against white — below the 4.5:1 AA threshold, and the same class of
      defect this project fixed once before and recorded in the README. The
      line-through carries the state, so only the colour needed correcting.

- [ ] 8. Reconcile and merge
  - Update requirements/design/tasks to match what was built, including any decision that changed during implementation
  - Update README.md and AI_CONTEXT.md
  - Run every gate, push, and merge through a green PR

## Roadmap — recorded, not scheduled

**Removing a session (Requirement 9).** Decided 2026-08-31: **exclusion over
deletion**, and neither scheduled. The need may never arise — it would take a
check opened in error, or one invalidated by events like a conference week.

Kept on record so the thinking is not repeated if it does arise:

- **Exclusion, not deletion.** Responses are what team members wrote. Destroying
  them to tidy a chart removes the only record that anyone answered; exclusion
  leaves the history honest about its own gaps, and lets the dashboard show an
  annotated one.
- **The schema change waits.** `excludedAt` and `exclusionReason` are nullable,
  and *absent* means *not excluded*, so the migration is a metadata-only
  `ALTER TABLE ADD COLUMN` with no backfill — equally cheap before or after live
  data. Adding them speculatively would invite filtering on a column before
  anyone had agreed what it meant.
- **Hard deletion, if ever wanted, belongs with GDPR**, alongside the existing
  member data deletion — not as a dashboard control.

Requirement 9's acceptance criteria stand as written: Delivery Manager only, a
mandatory reason, an audit entry carrying the reason and the session's close date
that survives the session, an explicit confirmation, and every view ceasing to
count it — including returning the dashboard to its insufficient-data state if
fewer than two closed sessions remain.

## Where this came from

Every requirement traces to a manual pass over the live application on
2026-08-30, against real team data. None of it was found by a test, and none of
it failed one — the defects in group 1 sat behind green suites in exactly the
way `AGENTS.md` warns about.

Two findings are worth remembering beyond this spec:

- **The dashboard could not name a question theme nobody had answered**, because
  it derived its list from the data rather than from the catalogue. Absence
  was unrepresentable, so it was invisible.
- **The literal question text has existed in the database since the first
  migration** and has never been shown on the dashboard. Nothing failed; it
  simply was not asked for.
