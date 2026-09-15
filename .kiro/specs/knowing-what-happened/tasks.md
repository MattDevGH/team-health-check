# Implementation Plan

Phase 1 builds the recorder and proves it cannot leak or break anything. Phase 2
puts it where the absence actually hurt — the unattended job. Phase 3 covers
deliveries, which is where "I never got a message" becomes answerable.

Phases 2 and 3 are independent of each other and either can ship alone.

---

## Phase 1 — Something to record with

### 1.1 An event, written as JSON

- [ ] Failing test: an event is written as one line of JSON carrying its name,
      level and context
- [ ] Failing test: the sink is injectable, so a test reads what was written
      rather than capturing stdout
- [ ] Failing test: the default sink is the console, so nothing has to be wired
      up for it to work in production
- [ ] Failing test: a timestamp is included, because a line without one cannot
      be placed in a sequence
- _Requirements: Knowing What Happened 4.1, 4.2, 4.3, 4.4_

### 1.2 It cannot leak

- [ ] Failing test: a score, a trend indicator or free text passed as context is
      not written
- [ ] Failing test: a token or secret passed as context is not written
- [ ] Property test: for arbitrary context, no forbidden key appears in the
      output — an allowlist is an invariant, not three examples
- [ ] Failing test: `memberId` is allowed and an email address is not, since one
      is already in the database and the other is the person
- [ ] Mutation check: widen the allowlist and watch the property fail
- _Requirements: Knowing What Happened 5.1, 5.2, 5.3, 5.4_
- _Property: 2_

### 1.3 It cannot break anything

- [ ] Failing test: a sink that throws does not propagate to the caller
- [ ] Failing test: the value an operation returns is identical whether its
      logging succeeds, fails, or is silenced
- [ ] The suite sets a silent sink, so tests do not write their own logs into
      the run's output
- _Requirements: Knowing What Happened 6.1, 6.2, 6.3_
- _Property: 3_

**Checkpoint:** there is a recorder, and it is safe to use anywhere. One PR.

---

## Phase 2 — The unattended job says what it did

### 2.1 The scheduler records its decisions

- [ ] Failing test: opening a session records which team and which session
- [ ] Failing test: closing one does the same
- [ ] Failing test: materialising one does the same
- [ ] Failing test: a team with no schedule records *why* it was skipped, not
      merely that nothing happened
- [ ] Failing test: a team outside its collection window records that reason
      rather than the same one
- [ ] Failing test: every event from one tick carries the tick's id
- _Requirements: Knowing What Happened 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
- _Property: 1, 4_

### 2.2 The response says it too

- [ ] Failing test: the tick's response carries counts of what it opened,
      closed and materialised
- [ ] Failing test: it carries the tick id, so a response can be tied to the
      lines it produced
- [ ] Failing test: it carries no answer content — counts and ids only
- [ ] Verify against production: read a real tick's response from cron-job.org
      and confirm it says something a person can act on
- _Requirements: Knowing What Happened 1.4, 1.5_

**Checkpoint:** "why did no check open on Monday?" is answerable. One PR.

---

## Phase 3 — Deliveries are accounted for

### 3.1 A prompt's outcome is recorded

- [ ] Failing test: a delivered Slack prompt records the member it reached
- [ ] Failing test: a failed one records the member, the channel and the reason
- [ ] Failing test: a reminder is distinguishable from an opening prompt —
      assert the event name, because a reminder that rendered identically to a
      prompt passed its test for an entire milestone
- [ ] Failing test: a logging failure does not stop a delivery, and a delivery
      failure does not stop the record
- _Requirements: Knowing What Happened 3.1, 3.2, 3.3, 3.4_

### 3.2 The existing lines get their context

- [ ] The five `console.error` calls that exist say things like `Slack delivery
      failed after 3 attempts: Error` — no team, no member, no session. Give
      them the recorder and the ids they were always missing
- [ ] Failing test: the central unexpected-error handler records the route it
      came from
- _Requirements: Knowing What Happened 2.1, 2.2_

**Checkpoint:** "I never got a message" has an answer. One PR.

---

## Phase 4 — Say where to look

### 4.1 Document it

- [ ] `docs/operations.md`: the event names, what each means, and what to filter
      on when a specific question is being asked
- [ ] State plainly that retention is the platform's decision and that the
      window on the current plan should be checked before treating these as a
      historical record
- [ ] Record the join between the two records a person might read: an audit
      entry's id appears in both the audit log a manager sees and the events an
      engineer reads
- _Requirements: Knowing What Happened 2.4, NFR 2.1_

### 4.2 Close the milestone

- [ ] Reconcile the deployment spec's open task, "establish how a stopped
      trigger would be noticed" — the same gap from the other side
- [ ] Update `AI_CONTEXT.md` and `README.md`
- [ ] Full gate set

**Checkpoint:** the record exists, is findable, and is documented. One PR.

---

## Deliberately not in this milestone

- **Request-level tracing.** A correlation id on every request answers questions
  nobody has yet, and costs a line per request on a plan with limited retention.
- **Alerting.** Nothing here pages anyone. Making a stopped trigger notify
  somebody is a separate decision with a separate cost.
- **A logging service.** No account, no network call, no vendor.
