# Requirements Document

## Introduction

`knowing-what-happened` gave the scheduler a voice. This gives it a memory.

The tick now says what it did, in a sentence, in its HTTP response. Two things
found on 2026-09-16, both by looking at the real thing rather than at the code:

1. **cron-job.org shows no response body until you ask it to.** The setting
   exists — *save responses* — and is off by default. Enabled, it keeps the
   **last 50 executions** and bodies for **two days**, whichever binds first.
2. **Vercel's Hobby plan keeps runtime logs for one hour.** That is where every
   event the recorder writes goes: `tick.skipped` and its reasons,
   `session.materialise.failed`, `notification.*.delivered`, `request.failed`.

So the milestone named *Knowing What Happened* currently knows what happened for
between fifty minutes and four hours, depending on the tick interval, and then
forgets. The question it was named after — *"why did no check open on Monday?"*
— is typically asked on Tuesday.

### Why fifty is worse than it sounds

The cap is counted in executions, not in time, and the tick runs on a fixed
interval. So the window is whatever fifty ticks span:

| Tick interval | 50 executions span | What binds first |
|---|---|---|
| 1 minute | 50 minutes | the 50 cap |
| 5 minutes | 4 hours 10 minutes | the 50 cap |
| 15 minutes | 12 hours 30 minutes | the 50 cap |
| 30 minutes | 25 hours | the 50 cap |
| 60 minutes | 50 hours | the 2-day cap |

At every interval this scheduler can usefully run at, **the 50-execution cap is
the limit and the two days never arrive.**

The shape of the loss matters more than its size. On a weekly cadence almost
every tick is a quiet one: a team that opens Monday and closes Friday produces
perhaps three interesting executions a week out of two thousand. The three that
matter are evicted, within hours, by the hundreds of *"nothing was due"* entries
that follow them. **A record that keeps the most recent fifty keeps the least
interesting fifty**, because interesting is rare and recent is not.

And a trigger that has stopped sends no response at all, so the one failure the
response body most needs to report is the one it structurally cannot.

## What this is not

**Not a logging service.** No account, no vendor, no network call, no log drain
— the same position `knowing-what-happened` took and for the same reasons. This
keeps a small, bounded record in the database the application already has.

**Not everything.** The recorder's event stream stays where it is, on stdout,
with the platform's retention. What is worth keeping past an hour is a much
smaller thing than what is worth writing: the scheduler's decisions, and only
those it made when something actually happened.

**Not an alerting system.** Nothing here pages anybody. It makes a stopped
scheduler *visible to somebody who looks*, which is the gap the dashboard's
"the scheduler may not be running" is currently papering over. Making that
automatic is a separate decision with a separate cost.

**Not a bridge to the audit log.** Matt asked on 2026-09-15 whether there should
be a shared identifier between the readable change-log a delivery manager sees
and a system record for troubleshooting. Checked on 2026-09-16: the scheduler
writes **no** audit entries. All ten change types — `schedule_change`,
`member_added`, `privacy_mode_changed` and the rest — are human actions. The two
records never describe the same event, so there is nothing to map between them.
They are complementary, not overlapping, and a shared id would be an identifier
for a join nobody can make.

## Glossary

- **Tick**: one call to `POST /api/scheduler/tick`.
- **Quiet tick**: one that opened, closed, materialised and prompted nothing.
  The normal case, most of the time, and correct.
- **Eventful tick**: one that changed something, or failed to.
- **Heartbeat**: the record that the scheduler ran at all, written by every
  tick including a quiet one.
- **Ledger**: the retained record of eventful ticks.

## Requirements

### Requirement 1: The Scheduler Leaves Proof It Ran

**User Story:** As the maintainer, I want to know when the scheduler last ran, so that "has it stopped?" is answered by looking rather than by inferring.

*A stopped trigger and a quiet week are the same thing from outside. That is the whole reason the dashboard has an "overdue" state — it is the interface guessing at something the system could simply know.*

#### Acceptance Criteria

1. EVERY tick SHALL record that it ran, including when, whether or not it did anything.
2. THE heartbeat SHALL be a single record, replaced each tick, so that its size does not grow with time.
3. THE heartbeat SHALL carry the tick's summary sentence and counts, so that "what did it last do?" is answered by the same read as "is it alive?".
4. WHERE writing the heartbeat fails, THE tick SHALL continue and SHALL record the failure — a scheduler that stops working because it could not write down that it was working is a worse outcome than one that forgets.
5. THE heartbeat SHALL be safe to write from two ticks at once, since nothing prevents a second cron service, a manual `curl`, or an overlapping run.

*Criterion 1 is why the heartbeat cannot be "the most recent ledger row". A quiet tick writes no ledger row, so a genuinely quiet week would be indistinguishable from a week of not running — which is the exact confusion this milestone exists to remove.*

### Requirement 2: What Is Kept Is Chosen By What Happened

**User Story:** As the maintainer, I want the ticks that did something to survive the ones that did not, so that a week of quiet does not erase the morning that mattered.

*cron-job.org keeps the most recent fifty, which on a weekly cadence means it keeps the least interesting fifty.*

#### Acceptance Criteria

1. WHERE a tick opens, closes or materialises a session, or sends a prompt, IT SHALL be written to the ledger.
2. WHERE a tick records a failure — a materialisation that did not run, a delivery that did not arrive — IT SHALL be written to the ledger regardless of what else it did.
3. WHERE a tick did none of those things, IT SHALL NOT be written to the ledger, so that quiet ticks cannot evict eventful ones.
4. A ledger entry SHALL carry the tick's id, when it ran, its counts, its skip reasons, and its summary sentence.
5. THE ledger SHALL be readable in reverse chronological order without reading all of it.

### Requirement 3: The Record Is Bounded

**User Story:** As the maintainer, I want the record to stop growing on its own, so that remembering does not become a thing I have to maintain.

*The alternative to somebody else's eviction policy is having one, not having none.*

#### Acceptance Criteria

1. THE ledger SHALL retain entries for a stated period, and the period SHALL be stated in `docs/operations.md`.
2. Pruning SHALL happen as part of the tick, so that it needs nothing scheduled of its own.
3. Pruning SHALL be idempotent and SHALL NOT fail the tick that performs it.
4. THE retention period SHALL be long enough to answer a question asked the following week, which the current hour is not.

### Requirement 4: The Record Never Leaks What It Should Not

**User Story:** As a team member, I want the operational record to say nothing about my answers, so that a maintainer reading it learns nothing about me.

*The same rule the recorder already enforces, restated because this one is durable and the recorder's is not.*

#### Acceptance Criteria

1. A ledger entry SHALL contain counts, ids, reasons and its own summary sentence, and nothing else.
2. A ledger entry SHALL NOT contain a score, a trend indicator, free text written by a member, a session or magic-link token, or an email address.
3. A ledger entry SHALL NOT contain a member id, so that the ledger is untouched by a member's right to have their data deleted.

*Criterion 3 is a deliberate restriction rather than an observation. Prompt counts are enough to say a tick prompted somebody; which member it reached is a question for the delivery record, which is scoped to a session and already covered.*

### Requirement 5: The Dashboard Stops Guessing

**User Story:** As a delivery manager, I want to be told why my results have not appeared, so that I can tell "the scheduler is broken" from "it has not got to it yet".

*`RESULTS_OVERDUE_AFTER_MS` infers a stalled scheduler from fifteen minutes of silence. It is a reasonable guess and it is still a guess, made on a page that could simply ask.*

#### Acceptance Criteria

1. WHERE results are overdue AND the scheduler has run since the session closed, THE dashboard SHALL say so, since the fault is then not a stopped trigger.
2. WHERE results are overdue AND the scheduler has not run since the session closed, THE dashboard SHALL say when it last ran.
3. WHERE the scheduler has never run, THE dashboard SHALL say that, rather than reporting an absence as a delay.
4. THE message SHALL remain intelligible to somebody who does not know what a tick is.
5. THE dashboard SHALL NOT become slower to load because of this — the heartbeat is one row and SHALL be read as part of work the page already does, not as a new round trip.

## Non-Functional Requirements

### NFR 1: Cost Per Tick

1. A quiet tick SHALL add at most one database write.
2. Pruning SHALL NOT scan the whole ledger on every tick.

### NFR 2: Failure Is Contained

1. No failure of this feature SHALL prevent a check opening, closing, materialising or being prompted.
2. A failure to record SHALL itself be recorded through the existing recorder.

### NFR 3: Accessibility

1. Every new message or state SHALL meet the standing bar: axe against WCAG 2.1 AA, asserted semantics, keyboard operation driven end to end.

### NFR 4: Migration Safety

1. THE schema change SHALL be additive, so that a deployed application keeps working against the previous schema until it is replaced.
2. A production snapshot SHALL be taken before the migration is applied, because Turso has export and no point-in-time restore.
