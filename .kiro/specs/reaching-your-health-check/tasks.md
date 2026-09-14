# Implementation Plan

Phase 1 makes the open check reachable, which is the defect. Phase 2 adds the
second delivery channel. Phase 3 gives the member control of it.

Phase 1 alone fixes the situation found on 2026-09-14: a check that opened on
schedule and could not be answered by anyone. It depends on nothing external and
can ship on its own.

---

## Phase 1 — A member can reach their own check

### 1.1 Resolve the signed-in member's current session link

- [ ] Failing test: a member with a link for the collecting session gets it
- [ ] Failing test: a member with no link for it gets nothing, rather than
      another member's
- [ ] Failing test: no collecting session returns a "nothing open" result, not
      an error
- [ ] Failing test: a closed session is not offered, since answers are no longer
      accepted
- [ ] Failing test: the member is taken from `AuthContext`, never from input
- [ ] Mutation check: resolve by team instead of by member and watch the
      cross-member test fail
- _Requirements: 1.6, 2.1, 2.3, NFR 1.1_
- _Properties: 1, 2_

### 1.2 A route of its own, in the navigation shell

- [ ] Failing test: the route redirects to the member's session link when a
      check is collecting
- [ ] Failing test: it explains itself when nothing is open, rather than 404ing
- [ ] Failing test: it works for a contributor, not only a Delivery Manager
- [ ] Failing test: an unauthenticated visitor is not told whether a check is
      open
- [ ] Add it to the shell's destinations, and to the mounting contract test
- [ ] axe, including the nothing-open state
- _Requirements: 1.2, 1.3, 1.5_

### 1.3 A link on the dashboard

- [ ] Failing test: while collecting, the lifecycle panel offers a route to
      answer
- [ ] Failing test: it is absent when nothing is collecting
- [ ] Failing test: it does not replace or disturb the close control — adding a
      control can make an existing one ambiguous, which this project has already
      learned once
- [ ] Failing test: a member who has answered everything can still get back in
      to review
- [ ] axe and keyboard operation
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

- [ ] A signed-in member opens a check, reaches it from the dashboard, answers,
      and sees their answers saved
- [ ] The same from the navigation route
- [ ] A contributor, not a Delivery Manager, can do both
- [ ] axe on both new surfaces
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
