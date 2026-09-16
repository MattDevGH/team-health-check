# Implementation Plan

Phase 1 builds the recorder and proves it cannot leak or break anything. Phase 2
puts it where the absence actually hurt — the unattended job. Phase 3 covers
deliveries, which is where "I never got a message" becomes answerable.

Phases 2 and 3 are independent of each other and either can ship alone.

---

## Phase 1 — Something to record with

### 1.1 An event, written as JSON

- [x] Failing test: an event is written as one line of JSON carrying its name,
      level and context
- [x] Failing test: the sink is injectable, so a test reads what was written
      rather than capturing stdout
- [x] Failing test: the default sink is the console, so nothing has to be wired
      up for it to work in production
- [x] Failing test: a timestamp is included, because a line without one cannot
      be placed in a sequence
- _Requirements: Knowing What Happened 4.1, 4.2, 4.3, 4.4_

### 1.2 It cannot leak

- [x] Failing test: a score, a trend indicator or free text passed as context is
      not written
- [x] Failing test: a token or secret passed as context is not written
- [x] Property test: for arbitrary context, no forbidden key appears in the
      output — an allowlist is an invariant, not three examples
- [x] Failing test: `memberId` is allowed and an email address is not, since one
      is already in the database and the other is the person
- [x] Mutation check: widen the allowlist and watch the property fail
- _Requirements: Knowing What Happened 5.1, 5.2, 5.3, 5.4_
- _Property: 2_

### 1.3 It cannot break anything

- [x] Failing test: a sink that throws does not propagate to the caller
- [x] Failing test: the value an operation returns is identical whether its
      logging succeeds, fails, or is silenced
- [x] The suite sets a silent sink, so tests do not write their own logs into
      the run's output
- _Requirements: Knowing What Happened 6.1, 6.2, 6.3_
- _Property: 3_

**Checkpoint:** there is a recorder, and it is safe to use anywhere. One PR.

---

## Phase 2 — The unattended job says what it did

### 2.1 The scheduler records its decisions

- [x] Failing test: opening a session records which team and which session
- [x] Failing test: closing one does the same
- [x] Failing test: materialising one does the same
- [x] Failing test: a team with no schedule records *why* it was skipped, not
      merely that nothing happened
- [x] Failing test: a team outside its collection window records that reason
      rather than the same one
- [x] Failing test: every event from one tick carries the tick's id
- _Requirements: Knowing What Happened 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
- _Property: 1, 4_

### 2.2 The response says it too

- [x] Failing test: the tick's response carries counts of what it opened,
      closed and materialised
- [x] Failing test: it carries the tick id, so a response can be tied to the
      lines it produced
- [x] Failing test: it carries no answer content — counts and ids only
- [x] Verify against production: a real tick's response was read from
      cron-job.org — and the answer was no. `{ opened: 0, closed: 0,
      materialised: 2, prompts: 3 }` satisfied every criterion above and still
      needed "a reminder of what it's telling me". See 2.3.
- _Requirements: Knowing What Happened 1.4, 1.5_

### 2.3 A person can act on it

The counts were never the missing piece. `opened: 0` is the correct outcome on
a Wednesday and a failure on Monday at 15:30, and no number tells the two
apart — the reason does, and the reasons were being recorded to a server log
nobody reads on a schedule while the response carried only the totals.

- [x] Failing test: the sentence leads with what changed, in the words a
      person would use — "computed results for", never "materialised"
- [x] Failing test: a tick that did nothing says so, and says why, counting
      the teams each reason applied to and putting the commonest first
- [x] Failing test: a tick with no teams at all says that instead of
      "nothing was due" — a different fact
- [x] Failing test: the tick returns its skip reasons, not just its counts
- [x] Failing test: the reasons returned match the reasons recorded, so a new
      skip reason cannot be logged without also reaching the response
- [x] Failing test: the sentence carries no score or trend — it goes to a
      third party's dashboard
- [x] End-to-end: read the sentence out of the real response body, which is
      the only place the route composes one
- [ ] Verify against production: read the next scheduled run's response and
      confirm the sentence reads as intended — needs a deploy and the next run
- _Requirements: Knowing What Happened 1.4, 1.6_

**Checkpoint:** "why did no check open on Monday?" is answerable. One PR.

---

## Phase 3 — Deliveries are accounted for

### 3.1 A prompt's outcome is recorded

- [x] Failing test: a delivered Slack prompt records the member it reached
- [x] Failing test: a failed one records the member, the channel and the reason
- [x] Failing test: a reminder is distinguishable from an opening prompt —
      assert the event name, because a reminder that rendered identically to a
      prompt passed its test for an entire milestone
- [x] Failing test: a logging failure does not stop a delivery, and a delivery
      failure does not stop the record
- _Requirements: Knowing What Happened 3.1, 3.2, 3.3, 3.4_

### 3.2 The existing lines get their context

- [x] The five `console.error` calls that exist say things like `Slack delivery
      failed after 3 attempts: Error` — no team, no member, no session. Give
      them the recorder and the ids they were always missing
- [x] Failing test: the central unexpected-error handler records the route it
      came from
- _Requirements: Knowing What Happened 2.1, 2.2_

**Checkpoint:** "I never got a message" has an answer. One PR.

---

## Phase 4 — Say where to look

### 4.1 Document it

- [x] `docs/operations.md`: the event names, what each means, and what to filter
      on when a specific question is being asked
- [x] State plainly that retention is the platform's decision and that the
      window on the current plan should be checked before treating these as a
      historical record
- [x] Record the join between the two records a person might read: an audit
      entry's id appears in both the audit log a manager sees and the events an
      engineer reads
- _Requirements: Knowing What Happened 2.4, NFR 2.1_

### 4.2 Close the milestone

- [x] Reconcile the deployment spec's open task, "establish how a stopped
      trigger would be noticed" — the same gap from the other side
- [x] Update `AI_CONTEXT.md` and `README.md`
- [x] Full gate set

**What building it found:** the redactor ate the ids. A team id is thirty-six
characters of letters, digits and hyphens, which is exactly what a
session-token pattern matches, so every event came out carrying
`teamId: "[redacted]"` — the record destroying the one thing it exists to
carry, while passing its own tests, which all used ids like `team-1`. Found by
running the scheduler rather than by testing the recorder. Redaction now
applies to prose fields only.

**Checkpoint:** the record exists, is findable, and is documented. One PR.

---

## Deliberately not in this milestone

- **Request-level tracing.** A correlation id on every request answers questions
  nobody has yet, and costs a line per request on a plan with limited retention.
- **Alerting.** Nothing here pages anyone. Making a stopped trigger notify
  somebody is a separate decision with a separate cost.
- **A logging service.** No account, no network call, no vendor.
