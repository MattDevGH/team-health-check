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
- [ ] Failing test: a member who has answered everything can still get back in
      to review — the link renders unconditionally while a check collects, so
      the behaviour is there and nothing asserts it
- [ ] axe and keyboard operation — the panel's test file has no axe coverage at
      all, which is a gap this reconciliation found rather than one it made
- _Requirements: 1.1, 1.4_

**Checkpoint:** the defect is fixed. A check that opens can be answered by
anyone signed in, with no delivery channel involved. One PR.

---

## Phase 2 — Email can carry a prompt

### 2.1 `EmailService` can send a prompt

- [ ] Failing test: the message contains the member's session link
- [ ] Failing test: it says when the check closes
- [ ] Failing test: it is distinguishable from a magic link — assert the body,
      not that a sender was called. A reminder that rendered identically to an
      opening prompt passed a "was it called" test for an entire milestone
- [ ] A second method rather than a `type` flag, so the templates cannot drift
      into being the same one
- _Requirements: 3.1, 3.3_

### 2.2 An opening check prompts by email

- [ ] Failing test: an eligible member is prompted by email when a check opens
- [ ] Failing test: availability still gates it — an away member is not
      prompted by a channel that did not exist when that rule was written
- [ ] Failing test: email failure does not prevent Slack delivery
- [ ] Failing test: Slack failure does not prevent email
- [ ] Failing test: a member is prompted at most once per check per channel,
      through the existing `NotificationDelivery` claim
- [ ] Failing test: a delivery failure is reported rather than swallowed
- _Requirements: 3.2, 3.4, 3.5, NFR 2.1, NFR 2.2_
- _Properties: 3, 4_

**Checkpoint:** a team with no Slack hears about its health checks. One PR.

---

## Phase 3 — The member chooses

### 3.1 An email-prompt preference

- [ ] Failing test: the field persists and is returned by `GET /api/me`
- [ ] Failing test: the profile page reads it from the API rather than assuming
      — the page once rendered a `privacyMode` the API never sent, and this is
      the same shape of mistake
- [ ] Failing test: it defaults to on for a member with no Slack link
- [ ] Failing test: it defaults to off for a member with Slack linked
- [ ] Failing test: an explicit setting overrides the default in both directions
- _Requirements: 4.1, 4.3_

### 3.2 It governs prompts only

- [ ] Failing test: a member with email prompts off still receives a magic link
- [ ] Failing test: it does not affect `remindersEnabled` behaviour, or the
      reverse
- [ ] Failing test: the control says what it affects and what it does not
- [ ] axe and keyboard operation on the new control
- _Requirements: 4.2, 4.4, 4.5, NFR 3.1_
- _Property: 5_

### 3.3 Say which channels exist

- [ ] README and `docs/deployment.md`: the channels, what each requires, and
      what happens when only one is configured
- [ ] State plainly that Slack was the only prompt channel until this milestone,
      so a deployment without it told nobody anything
- _Requirements: 5.3_

---

## Phase 4 — Prove it

### 4.1 End to end

- [x] A signed-in member opens a check, reaches it from the dashboard, answers,
      and sees their answers saved
- [x] The same from the navigation route
- [ ] A contributor, not a Delivery Manager, can do both — the route tests
      prove the API answers one; no browser test walks it as one
- [ ] axe on both new surfaces — covered for the `/me/health-check` page in its
      own tests, not in the browser tier
- _Requirements: 1.1, 1.2, 1.5, NFR 3.1_

### 4.2 Against production

- [ ] Open a check on the deployed application and answer it from the interface,
      with no session link from any message
- [ ] Confirm the response reached Turso by reading it back
- [ ] With a verified sending domain: confirm an email prompt arrives, carries a
      working link, and is not mistaken for a sign-in email
- _Requirements: 1.1, 3.1, 3.3_

### 4.3 Reconcile

- [ ] Update README and AI_CONTEXT
- [ ] Record anything the production pass found that no test could
- [ ] Full gate set, then merge

---

## Roadmap, deliberately unscheduled

- **Email fallback when Slack delivery fails.** The stated hole in decision 3: a
  Slack-linked member whose delivery fails hears nothing, because email
  defaulted off. Needs the retry queue to report outcomes.
- **Digests.** One prompt per check for now.
- **Per-team channel policy.** Today the preference belongs to the member.
