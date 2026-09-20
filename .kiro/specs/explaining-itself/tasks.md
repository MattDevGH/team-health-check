# Implementation Plan

Ordered by how much a real user is currently misled. Phase 1 is the one that
made a working tool look broken; phase 4 is the one that changes behaviour
invisibly.

Every phase is independent and shippable on its own.

---

## Phase 1 — An empty dashboard says why

### 1.1 Name the three silences

- [x] Failing test: a closed session with no aggregates is reported as *pending*
- [x] Failing test: a value below the anonymity threshold is reported as
      *suppressed*
- [x] Failing test: a question nobody answered is reported as *unanswered*
- [x] Failing test: pending is only possible for a closed session — an open one
      has no results due yet
- [x] Failing test: suppression applies only in anonymous mode
- [x] A pure selector over the data the dashboard already receives, so the rule
      is testable without rendering
- _Requirements: 1.4_
- _Properties: 1, 2_

### 1.2 Say it on the panels people read

- [x] Failing test: the latest-session panel says results are being prepared for
      a just-closed check
- [x] Failing test: it says how long — minutes, not an unbounded wait
- [x] Failing test: it distinguishes that from suppression and from unanswered
- [x] Failing test: the same in the question themes list, which is where a
      reader goes next
- [x] axe on each new state
- _Requirements: 1.1, 1.2, 1.3, 1.5, NFR 2.1_

### 1.3 Make the panels reachable for a team with one closed check

- [x] Failing test: the trends route returns a single closed session rather
      than withholding it with the trend
- [x] Failing test: the dashboard shows that session’s scores while still
      saying a second check is needed before a trend can be drawn
- [x] Failing test: an uncomputed first close reads as *being prepared*, not
      as *more data needed*
- [x] Browser tests for both, plus a team whose closes were never materialised
- _Requirements: 1.1, 1.5_

Not in the original plan. Found while building 1.2: every explanation above
was unreachable for a team that had closed exactly one check, because the
route withheld the session whenever it could not draw a trend. That is the
state the delivery manager was actually in on production when this spec was
written.

**Extra work this phase turned out to need:** `materialisedAt` on
`HealthCheckSession`. The spec assumed the data already distinguished "not
computed yet" from "nobody answered"; it did not, and the only remaining
signal was elapsed time. A fourth state — *overdue* — falls out of the new
column, and it is the one that would have surfaced a stopped cron.

**Checkpoint:** a reader can tell working from broken. One PR.

---

## Phase 2 — Submitting has an ending

### 2.1 Confirm, and say answers can still change

- [x] Failing test: after submitting, the page says the answers were saved
- [x] Failing test: it says they can be changed until the check closes
- [x] Failing test: the form is still there and still editable
- [x] Failing test: the control reads as *update* once answers exist, not as a
      first submission
- [x] Failing test: resubmitting unchanged answers is harmless and says so
- _Requirements: 2.1, 2.2, 2.4, 2.5_
- _Property: 3_

### 2.2 Offer a way onward that works for both audiences

- [x] Failing test: a signed-in member is offered their health check page
- [x] Failing test: someone on a session link alone is not offered a link they
      cannot use — they arrived from a prompt and may be signed into nothing
- [x] Failing test: the confirmation stands on its own where no link applies
- [x] axe and keyboard operation on the confirmed state
- _Requirements: 2.3, NFR 2.1_

**Corrected while building 2.2:** the spec said a member on a session link
alone may be signed in to nothing, and that is not how this product works.
`/api/auth/session-link/[token]` establishes a session for that member until
the check closes, so everyone who reaches the confirmation has somewhere to
go. The guard on the link stays for the cases that are real — a browser
refusing cookies, a session expired at close — and the decision not to
redirect stands on its own reason: taking the form away is the thing this
phase exists to stop.

**Checkpoint:** the loop ends somewhere. One PR.

---

## Phase 3 — Offer only what a member can use

### 3.1 Settings leaves a contributor's navigation

- [x] Failing test: `destinationsFor` omits Settings without the manager role
- [x] Failing test: a Delivery Manager still sees it
- [x] Failing test: the dashboard is still offered to both, because the data
      there is aggregate and a team should read its own results
- [x] Failing test: route behaviour is unchanged — navigation is not
      authorisation, and a contributor reaching the URL sees what they saw
      before
- [x] Update the end-to-end tab-order expectation. The existing one did not
      move: every member the browser suite seeds is a Delivery Manager, so it
      still tabs through seven. A contributor’s order is a new test, and it is
      the one that would have caught this.
- [x] Browser test: a contributor reaching `/settings` by URL sees what they
      saw before — the assertion that says this is honesty rather than a lock
- _Requirements: 3.1, 3.2, 3.3, 3.4_
- _Property: 4_

---

## Phase 4 — The profile explains itself

### 4.1 Say what each setting does

- [x] Failing test: cadence preference explains weekly versus micro-pulse in
      terms of what the member will be asked
- [x] Failing test: the reminders toggle names what it governs **and** says it
      does not affect sign-in or opening prompts — a member who turns it off
      expecting silence will still be prompted when a check opens
- [x] Failing test: availability explains what it stops and for how long, and
      that a check already open stays answerable — being away gates
      notifications and nothing else
- [x] Failing test: Slack linking explains what linking does and how to get a
      code, beyond naming the command
- [x] Failing test: the code's stated lifetime is pinned to
      `PAIRING_CODE_EXPIRY_MS`, so copy cannot quietly stop being true
- [x] Failing test: each explanation is associated with its control by
      `aria-describedby`, not merely placed beside it
- [x] Failing test: every `aria-describedby` on the page resolves to real text
      — a reference to a missing id is silent, and asserting the attribute
      alone would pass
- [x] axe on the profile page, both Slack branches; mutation-checked by
      removing a label and watching it fail. The browser audit covers it too,
      with the contrast jsdom cannot see
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, NFR 1.1, NFR 1.2_

### 4.2 An away period can be seen

- [x] Route: `GET /api/me/availability`. The service has had
      `getAvailability` since availability was built and no route ever called
      it, so there was nothing for the page to read
- [x] Failing test: a set away period is shown with its dates
- [x] Failing test: no away period says so rather than rendering an empty
      control
- [x] Failing test: the page reads it from the API rather than assuming — the
      profile once rendered a `privacyMode` the API never sent
- [x] Failing test: the route never returns another member's period — the id
      comes from the session and there is no parameter to pass somebody else's
- [x] Failing test: marking away shows the period it just created, rather than
      announcing "saved" and showing nothing
- [x] MSW default handler for the new route, so every profile test runs against
      the real contract instead of a swallowed fetch failure
- _Requirements: 5.1, 5.3_

### 4.3 And cancelled

- [x] Failing test: cancelling removes it, and sends the id of the period the
      member is looking at rather than letting the server pick
- [x] Failing test: cancelling takes effect immediately for prompt eligibility
- [x] **Defect found here.** `removeAway` took an id and deleted whatever it
      named, and the route passed one straight from the request body — any
      signed-in member could cancel any other member's away period given its
      id, and the member who lost it would be prompted through a holiday with
      nothing to explain why. The service now takes the member id and refuses
      anything that is not theirs. Property test, route test, and a mutation
      check that removes the guard and watches five tests fail
- [x] Failing test: a period belonging to somebody else is indistinguishable
      from one that never existed — same status, same body. A distinct error
      would confirm that the id names a real period
- [x] Failing test: cancelling something already gone is harmless
- [x] Failing test: a failed cancel says so rather than appearing to have
      worked, which would leave a member expecting silence they will not get
- [x] axe and keyboard operation on the new control, end to end through the
      real routes: set it, see it, cancel it with Enter, reload and see it stay
      gone
- _Requirements: 5.2, 5.4, 5.5_
- _Property: 5_

---

## Phase 5 — Prove it

### 5.1 End to end

- [x] A member answers, sees confirmation, and reaches somewhere from it.
      *Already covered when this was checked, by `navigation.spec.ts`
      "answering ends somewhere, and says the answers can still change" — the
      confirmation, the wording about changing answers until close, the control
      that now reads "update", and the door back into the application. Ticked
      on the test that exists rather than rewritten.*
- [x] A manager closes a check and sees results being prepared, then results.
      *New: `e2e/results-arriving.spec.ts`. The halves existed separately —
      `session-lifecycle.spec.ts` watched the message appear and
      `journey.spec.ts` ticked and read aggregates out of the database — and
      nothing walked a person from one to the other. A message that appears
      correctly and never clears is the same defect in slow motion.*
- [x] A contributor's navigation offers Health check, Dashboard and Profile.
      *Already covered by `navigation.spec.ts` "keeps the dashboard, the health
      check and the profile".*
- [x] axe across the new states. *Two were missing from the browser tier and
      are added: a dashboard whose results are being prepared, and one whose
      results are overdue. Both are muted text carrying the only explanation on
      the page, and jsdom cannot see a contrast failure.*
- _Requirements: 1.1, 2.1, 2.3, 3.1_

**What writing 5.1 found.** Criterion 1.2 asks the message to bound the wait,
and the bounded wording lived only in the dashboard's Latest Session panel —
which does not render until a team has results. So after a team's **first**
check closed, the one sentence on the page was the lifecycle panel's
open-ended "Results are still being prepared.", at the exact moment nobody yet
knows whether the tool works. The horizon is in both places now, and removing
it fails one unit test and two browser tests.

### 5.2 Against production

- [x] Walk the loop again on the deployed application: open, answer, close,
      read — and confirm that at no point does a blank panel leave the reader
      guessing. *Done 2026-09-19. The panels this milestone built read correctly
      the whole way through — "Results are being prepared / Results are
      hidden… message shows correctly throughout the dashboard". What the pass
      found instead is below.*
- [x] Set an away period, see it, cancel it. *Done 2026-09-20 on the deployed
      application: "away periods working and displaying as expected". All five
      criteria of Requirement 5 read correctly — the sentence when nothing is
      set, the period with its dates, and cancelling it.*
- _Requirements: 1.1, 1.3, 5.1, 5.2_

**What the walk found, and none of it failed a test.**

| Finding | Outcome |
|---|---|
| Updating an answer a second time still looked like nothing had happened | **Fixed.** Criterion 2.7 was unmet one press further along than the version repaired on the 18th: two updates in a row are both updates, so the second rendered the sentence already on screen. The confirmation carries the time now |
| Question Themes explained nothing, now that everything around it does | **Fixed.** New criterion 6.1 |
| "Open a health check" did not say what opening one does | **Fixed.** New criterion 6.2 — the only control here whose consequences reach other people |
| The mid-step before the form still read as a step that achieved nothing | **Fixed by giving it content.** New criterion 6.3, and the decision recorded there: content first, re-architecting only if that does not fix it |
| The theme rows opened one at a time | **Fixed.** Manager Experience 3.10, new — nothing had ever asked for an accordion |
| The confirmation's link led back to the mid-step | **Answered by 6.3.** It lands on something worth landing on now. If it still reads as redundant, the destination is the next lever |
| Noticeable load on first visit | Known, `feeling-responsive`, accepted |

*Two of those cost more than they looked. Adding the "what opening a check
does" line took the dashboard's cumulative layout shift from 0.016 to 0.0327,
past the 0.03 ratchet — the panel had always grown as its fetches landed, and
the new text made an existing instability breach the budget. It has a height
floor now, measured back to passing.*

*And the "Go to your health check" rename came out of asking what the GOV.UK
Design System would say: button text describes an action, and their own "Start
now" is a link styled as a button, which is exactly this element.*

### 5.3 Reconcile

- [x] Update README and AI_CONTEXT
- [x] Record what the production pass found that no test could
- [x] Full gate set, then merge

*Ticked on the gate set having run — 2222 Vitest tests across 222 files, 98
Playwright with zero skips, `tsc`, ESLint, `next build`, requirement references —
and on this pull request being the merge it names.*

**The spec is closed.** 61 of 61, across five phases and three production
passes. Worth keeping about how it ended: the phase called "prove it" found
seven defects, one while its browser tests were being written and six while a
person used the deployed application. None of them failed a test, and one of
them had a green test about it.

---

## Roadmap, deliberately unscheduled

- **Renaming the dashboard.** Considered and dropped — "Manage" is worse and no
  better name emerged. Worth revisiting only if a name suggests itself.
- **Recurring or future-dated availability.** One away period for now.
- **Making a closed check's results appear immediately.** The quiet period
  exists so late writes settle; saying so is the fix, not removing it.
