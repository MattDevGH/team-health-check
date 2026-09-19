# Implementation Plan

Phase 1 makes the open check reachable, which is the defect. Phase 2 adds the
second delivery channel. Phase 3 gives the member control of it.

Phase 1 alone fixes the situation found on 2026-09-14: a check that opened on
schedule and could not be answered by anyone. It depends on nothing external and
can ship on its own.

---

**Status, reconciled 2026-09-15.** Phase 1 shipped and this file still showed 0
of 48 ticked. Every box below was checked against the code and the test that
exercises it, one at a time — never in bulk. The 2026-08-23 closure audit found
the opposite failure, tasks marked complete before the behaviour existed, and it
cost days.

Two boxes could not honestly be ticked when the reconciliation started, because
`/api/me/health-check` had no test file at all — while exporting a `_testRepos`
seam "so route tests can seed data". The behaviour was right; the evidence was
missing. Those tests are written now and the boxes are ticked on them.

What remains unticked is genuinely unbuilt or genuinely unproven, and says which
in each case. Phases 2 and 3 are untouched: `EmailService` still has one method,
`sendMagicLink`, so nothing prompts by email.

---

## Phase 1 — A member can reach their own check

### 1.1 Resolve the signed-in member's current session link

- [x] Failing test: a member with a link for the collecting session gets it
- [x] Failing test: a member with no link for it gets nothing, rather than
      another member's
- [x] Failing test: no collecting session returns a "nothing open" result, not
      an error
- [x] Failing test: a closed session is not offered, since answers are no longer
      accepted
- [x] Failing test: the member is taken from `AuthContext`, never from input
- [x] Mutation check: resolve by team instead of by member and watch the
      cross-member test fail
- _Requirements: 1.6, 2.1, 2.3, NFR 1.1_
- _Properties: 1, 2_

### 1.2 A route of its own, in the navigation shell

- [x] Failing test: the route **offers** the member's session link when a check
      is collecting. *(Was "redirects". Changed during the build and the reason
      is worth keeping: landing straight in a form having clicked "Health check"
      gives no moment to realise what is about to be asked, and no way back
      without the browser button. There is a test asserting it does not redirect.)*
- [x] Failing test: it explains itself when nothing is open, rather than 404ing
- [x] Failing test: it works for a contributor, not only a Delivery Manager
- [x] Failing test: an unauthenticated visitor is not told whether a check is
      open
- [x] Add it to the shell's destinations, and to the mounting contract test
- [x] axe, including the nothing-open state
- _Requirements: 1.2, 1.3, 1.5_

### 1.3 A link on the dashboard

- [x] Failing test: while collecting, the lifecycle panel offers a route to
      answer
- [x] Failing test: it is absent when nothing is collecting
- [x] Failing test: it does not replace or disturb the close control — adding a
      control can make an existing one ambiguous, which this project has already
      learned once
- [x] Failing test: a member who has answered everything can still get back in
      to review. Mutation-checked by hiding the link at full participation,
      which is exactly the "helpful" change that would otherwise have passed
- [x] axe on both states, and the two controls reached by keyboard in a
      sensible order — answer before close, so somebody tabbing meets the
      ordinary action before the destructive one
- _Requirements: 1.1, 1.4_

**Checkpoint:** the defect is fixed. A check that opens can be answered by
anyone signed in, with no delivery channel involved. One PR.

---

## Phase 2 — Email can carry a prompt

### 2.1 `EmailService` can send a prompt

- [x] Failing test: the message contains the member's session link
- [x] Failing test: it says when the check closes, and still sends when nothing
      says — a check opened by hand has no scheduled close, and a prompt that
      threw would mean opening one manually silently stopped telling anybody
- [x] Failing test: it is distinguishable from a magic link — asserted on the
      subject and the body, and that it carries no `/auth/magic/` link at all
- [x] A second method rather than a `type` flag, so the templates cannot drift
      into being the same one. The in-memory fake keeps them in **separate
      lists** for the same reason: one list would let a test assert "an email
      was sent" and pass when the wrong one was
- _Requirements: 3.1, 3.3_

### 2.2 An opening check prompts by email

- [x] Failing test: an eligible member is prompted by email when a check opens
- [x] Failing test: availability still gates it — an away member is not
      prompted by a channel that did not exist when that rule was written.
      The delivery window gates it too
- [x] Failing test: email failure does not prevent Slack delivery
- [x] Failing test: Slack failure does not prevent email
- [x] Failing test: a member is prompted at most once per check per channel,
      through the existing `NotificationDelivery` claim — under its **own**
      claim type, since one shared with Slack would mean a member with Slack
      never receiving the email
- [x] Failing test: a delivery failure is reported rather than swallowed, and
      the record carries neither the address nor the session token
- [x] Failing test: the email carries **that member's** link and no other, and
      sends nothing when they have none — a session link authenticates whoever
      holds it
- [x] The tick counts members reached rather than messages sent: somebody who
      got both has been prompted once as far as a reader of the response is
      concerned
- [x] Mutation check: the away gate fails 2 tests, falling back to any link
      fails 1, and removing the idempotency claim fails 1
- _Requirements: 3.2, 3.4, 3.5, NFR 2.1, NFR 2.2_
- _Properties: 3, 4_

**Checkpoint:** a team with no Slack hears about its health checks. One PR.

---

## Phase 3 — The member chooses

### 3.1 An email-prompt preference

- [x] Failing test: the field persists and is returned by `GET /api/me`
- [x] Failing test: the profile page reads it from the API rather than assuming
      — the page once rendered a `privacyMode` the API never sent, and this is
      the same shape of mistake
- [x] Failing test: it defaults to on for a member with no Slack link
- [x] Failing test: it defaults to off for a member with Slack linked
- [x] Failing test: an explicit setting overrides the default in both directions
- _Requirements: 4.1, 4.3_

### 3.2 It governs prompts only

- [x] Failing test: a member with email prompts off still receives a magic link
- [x] Failing test: it does not affect `remindersEnabled` behaviour, or the
      reverse
- [x] Failing test: the control says what it affects and what it does not
- [x] axe and keyboard operation on the new control
- _Requirements: 4.2, 4.4, 4.5, NFR 3.1_
- _Property: 5_

### 3.3 Say which channels exist

- [x] README and `docs/deployment.md`: the channels, what each requires, and
      what happens when only one is configured
- [x] State plainly that Slack was the only prompt channel until this milestone,
      so a deployment without it told nobody anything
- _Requirements: 5.3_

---

## Phase 4 — Prove it

### 4.1 End to end

- [x] A signed-in member opens a check, reaches it from the dashboard, answers,
      and sees their answers saved
- [x] The same from the navigation route
- [x] A contributor, not a Delivery Manager, can do both. *Writing it found the
      gap it was meant to prove absent: the dashboard rendered the lifecycle
      panel — and so the "Answer the health check" link inside it — only for a
      Delivery Manager, so a contributor reading their team's results while a
      check collected was offered no way to take part. Requirement 1.1 asks the
      dashboard for that route and does not make it a privilege. The panel is
      rendered for everybody now with its open and close controls gated.*
- [x] axe on both new surfaces, in the browser tier rather than only jsdom.
      *Both states of the `/me/health-check` page, and the contributor's view of
      the panel — a state no manager ever lands on, and so one no page-level
      audit had ever visited.*
- _Requirements: 1.1, 1.2, 1.5, NFR 3.1_

### 4.2 Against production

- [x] Open a check on the deployed application and answer it from the interface,
      with no session link from any message. *Done 2026-09-18. Found three
      things no test had: the confirmation rendering above the form and so off
      the top of the screen, a second save being indistinguishable from nothing
      happening, and two buttons in a row both reading "Answer the health
      check".*
- [x] Confirm the response reached Turso by reading it back. *Five answers,
      average 4.00, read back with `scripts/verify-production.ts` — which also
      recomputes the aggregates from the raw rows and confirms the two agree.*
- [ ] With a verified sending domain: confirm an email prompt arrives, carries a
      working link, and is not mistaken for a sign-in email
- _Requirements: 1.1, 3.1, 3.3_

### 4.3 Reconcile

- [x] Update README and AI_CONTEXT. *README had drifted well past this
      milestone — it opened with "all three specs are complete" against twelve,
      and its Spec section listed four of them. All twelve are listed now, each
      with what is open and why.*
- [x] Record anything the production pass found that no test could. *Three
      defects, plus the one that writing the browser test found, plus a fifth
      that belonged to no milestone: four scheduler tests reading the wall clock,
      which failed for the first time at 17:00 UTC on a Friday and would have
      repaired themselves by morning.*
- [x] Full gate set, then merge

**Checkpoint: the milestone is closed except 4.2’s third box**, which needs a
verified Resend sending domain rather than any code. Slack is the only prompt
channel proved end to end in production; email is proved at every tier below
that. The unproved part is Resend delivering to somebody who is not the account
owner — which is the failure this project has already been bitten by once,
silently.

---

## Roadmap, deliberately unscheduled

- **Email fallback when Slack delivery fails.** The stated hole in decision 3: a
  Slack-linked member whose delivery fails hears nothing, because email
  defaulted off. Needs the retry queue to report outcomes.
- **Digests.** One prompt per check for now.
- **Per-team channel policy.** Today the preference belongs to the member.
