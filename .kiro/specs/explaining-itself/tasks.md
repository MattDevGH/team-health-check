# Implementation Plan

Ordered by how much a real user is currently misled. Phase 1 is the one that
made a working tool look broken; phase 4 is the one that changes behaviour
invisibly.

Every phase is independent and shippable on its own.

---

## Phase 1 — An empty dashboard says why

### 1.1 Name the three silences

- [ ] Failing test: a closed session with no aggregates is reported as *pending*
- [ ] Failing test: a value below the anonymity threshold is reported as
      *suppressed*
- [ ] Failing test: a question nobody answered is reported as *unanswered*
- [ ] Failing test: pending is only possible for a closed session — an open one
      has no results due yet
- [ ] Failing test: suppression applies only in anonymous mode
- [ ] A pure selector over the data the dashboard already receives, so the rule
      is testable without rendering
- _Requirements: 1.4_
- _Properties: 1, 2_

### 1.2 Say it on the panels people read

- [ ] Failing test: the latest-session panel says results are being prepared for
      a just-closed check
- [ ] Failing test: it says how long — minutes, not an unbounded wait
- [ ] Failing test: it distinguishes that from suppression and from unanswered
- [ ] Failing test: the same in the question themes list, which is where a
      reader goes next
- [ ] axe on each new state
- _Requirements: 1.1, 1.2, 1.3, 1.5, NFR 2.1_

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

- [ ] Failing test: `destinationsFor` omits Settings without the manager role
- [ ] Failing test: a Delivery Manager still sees it
- [ ] Failing test: the dashboard is still offered to both, because the data
      there is aggregate and a team should read its own results
- [ ] Failing test: route behaviour is unchanged — navigation is not
      authorisation, and a contributor reaching the URL sees what they saw
      before
- [ ] Update the end-to-end tab-order expectation
- _Requirements: 3.1, 3.2, 3.3, 3.4_
- _Property: 4_

---

## Phase 4 — The profile explains itself

### 4.1 Say what each setting does

- [ ] Failing test: cadence preference explains weekly versus micro-pulse in
      terms of what the member will be asked
- [ ] Failing test: the reminders toggle names what it governs **and** says it
      does not affect sign-in or opening prompts — a member who turns it off
      expecting silence will still be prompted when a check opens
- [ ] Failing test: availability explains what it stops and for how long
- [ ] Failing test: Slack linking explains what linking does and how to get a
      code, beyond naming the command
- [ ] Failing test: each explanation is associated with its control by
      `aria-describedby`, not merely placed beside it
- [ ] axe on the profile page
- _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, NFR 1.1, NFR 1.2_

### 4.2 An away period can be seen

- [ ] Failing test: a set away period is shown with its dates
- [ ] Failing test: no away period says so rather than rendering an empty
      control
- [ ] Failing test: the page reads it from the API rather than assuming — the
      profile once rendered a `privacyMode` the API never sent
- _Requirements: 5.1, 5.3_

### 4.3 And cancelled

- [ ] Failing test: cancelling removes it
- [ ] Failing test: cancelling takes effect immediately for prompt eligibility
- [ ] Failing test: a member cannot cancel another member's away period
- [ ] Failing test: cancelling something already gone is harmless
- [ ] axe and keyboard operation on the new control
- _Requirements: 5.2, 5.4, 5.5_
- _Property: 5_

---

## Phase 5 — Prove it

### 5.1 End to end

- [ ] A member answers, sees confirmation, and reaches somewhere from it
- [ ] A manager closes a check and sees results being prepared, then results
- [ ] A contributor's navigation offers Health check, Dashboard and Profile
- [ ] axe across the new states
- _Requirements: 1.1, 2.1, 2.3, 3.1_

### 5.2 Against production

- [ ] Walk the loop again on the deployed application: open, answer, close,
      read — and confirm that at no point does a blank panel leave the reader
      guessing
- [ ] Set an away period, see it, cancel it
- _Requirements: 1.1, 1.3, 5.1, 5.2_

### 5.3 Reconcile

- [ ] Update README and AI_CONTEXT
- [ ] Record what the production pass found that no test could
- [ ] Full gate set, then merge

---

## Roadmap, deliberately unscheduled

- **Renaming the dashboard.** Considered and dropped — "Manage" is worse and no
  better name emerged. Worth revisiting only if a name suggests itself.
- **Recurring or future-dated availability.** One away period for now.
- **Making a closed check's results appear immediately.** The quiet period
  exists so late writes settle; saying so is the fix, not removing it.
