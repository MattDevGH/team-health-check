# Design Document

## Overview

Two tables, one written by every tick and one written only by ticks that did
something, both pruned by the tick itself. No new service to run, no vendor, no
scheduled job of its own.

The split is the whole design. Everything else follows from it.

## Key Decisions

### 1. Two records, because they answer two different questions

"Is it running?" and "what did it do on Monday?" look like one question and are
not.

The first needs a write on **every** tick, including the quiet ones, because a
quiet week and a stopped scheduler are indistinguishable unless something is
written when nothing happens. The second needs a write on **no** quiet tick,
because quiet ticks are the majority and keeping them is what destroyed
cron-job.org's window in the first place.

One table cannot have both policies. So:

- `SchedulerHeartbeat` — one row, replaced every tick. Bounded by construction.
- `SchedulerTickRecord` — one row per eventful tick. Bounded by pruning.

A tempting third option is one table with a `kept` flag and aggressive pruning
of the unkept. It costs a write per tick either way, needs the prune to run more
often, and buys nothing: the two records genuinely have different lifetimes.

### 2. The heartbeat is replaced, not appended

An upsert against a fixed key, not an insert. Two consequences worth stating:

- **Size is constant.** There is no growth to manage, no retention decision, and
  no prune. That is the point of separating it from the ledger.
- **Concurrency is a non-issue by design.** Nothing stops a second cron service,
  a manual `curl`, or an overlapping run, and an upsert makes a race
  uninteresting: last write wins, and both writers wrote the truth.

### 3. Eventfulness is decided from the summary the tick already produces

`TickSummary` already carries `opened`, `closed`, `materialised` and `reasons`,
and the route already knows `prompts`. A tick is eventful when any of the first
four counts is non-zero, or when a failure was recorded during it.

This is deliberately not a new concept threaded through the scheduler. It is a
predicate over a value that already exists, which makes it a pure function with
its own tests and no reach into the tick's control flow.

**The failure case is the one to get right.** A tick that opened nothing, closed
nothing and failed to materialise a session is eventful precisely *because*
nothing happened. `session.materialise.failed` is currently recorded and
retried — for ever, silently, if the cause is permanent — and it is the single
most valuable thing in the ledger.

### 4. Writing happens at the route, because that is where the whole picture is

The scheduler service knows what it decided. Only the route knows how many
prompts went out, and the route already composes the summary sentence from both.

So the route is where the record is written, through a service over a
repository, like everything else. The scheduler keeps its current signature and
gains nothing it does not need — it does not learn about persistence, and its
in-memory fakes stay as they are.

### 5. Recording cannot break the thing it records

The same rule the recorder follows, applied to something with a bigger failure
surface: a database write can fail in ways `JSON.stringify` to stdout cannot.

A failed heartbeat or ledger write is caught, recorded through the existing
recorder as `tick.record.failed`, and the tick returns its summary as usual.
A scheduler that stops opening checks because it could not write down that it
was opening checks is a strictly worse system than one that forgets.

The difference from the recorder: the recorder swallows silently, because a
failed log line has nowhere to complain to. This has somewhere — the recorder.

### 6. Pruning rides along with the tick

Deleting where `ranAt` is older than the retention period, as part of the same
tick, in the same place `materialisePendingAggregates` already runs.

Bounded by an index on `ranAt`, so it is a ranged delete rather than a scan. On
a weekly cadence the ledger holds a few rows a week, so this will usually delete
nothing and cost one indexed lookup. That is acceptable; a scan would not be.

**90 days**, because the question this exists to answer — *"why did no check
open on Monday?"* — is asked days later, and because a quarter is the shortest
period over which a weekly cadence has a shape worth looking at.

### 7. The dashboard asks instead of inferring

`resultState` currently decides *overdue* from elapsed time alone. With a
heartbeat it can distinguish three cases it presently conflates:

| What is true | What it should say |
|---|---|
| Scheduler has run since the close | Results are late, but the scheduler is running |
| Scheduler has not run since the close | The scheduler has not run since *(time)* |
| Scheduler has never run | The scheduler has not run at all |

The third is not hypothetical: it is what a fresh deployment with a misconfigured
`CRON_SECRET` looks like, and "results are overdue" is an actively misleading
thing to say about it.

`resultState` is a pure function over its input. The heartbeat becomes another
field of that input, which keeps the decision table testable without rendering
and keeps the new states in the same place as the old ones.

**The load cost is zero extra round trips.** The dashboard is a Server Component
that already queries; the heartbeat is one row by primary key, fetched alongside
what it already fetches. A page that got slower in order to report on
punctuality would be its own joke.

### 8. No member ids, so deletion never has to consider this

The ledger holds counts, team-level reasons, session ids and its own sentence.
A member id would make it a place personal data lives, which would put it in
scope of the delete-my-data path, the export path, and every future question
about retention.

Prompt *counts* say a tick prompted somebody. *Which* member is a question the
delivery record already answers, scoped to a session. Keeping the ledger free of
member ids costs nothing and removes a whole class of obligation.

## Correctness Properties

1. **A tick always leaves a heartbeat.** For any tick that completes, the
   heartbeat's time is that tick's.
2. **Quiet ticks never enter the ledger.** For any tick with all counts zero and
   no failure, the ledger is unchanged.
3. **Eventful ticks always do.** For any tick with a non-zero count or a
   recorded failure, the ledger gains exactly one row.
4. **Recording never changes what the tick did.** For any tick, the sessions
   opened, closed and materialised are the same whether recording succeeds or
   throws.
5. **The ledger is bounded.** After pruning, no entry is older than the
   retention period.
6. **Nothing personal is in it.** No ledger row contains a member id, an email
   address, a token, a score or a trend.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Which ticks are eventful | Unit over a pure predicate | A decision table, testable without a database |
| Heartbeat replaced rather than appended | Integration over a real SQLite file | An upsert's behaviour is the adapter's, not the fake's |
| Two ticks at once | Integration | A race is not reproducible against an in-memory map |
| Recording failure leaves the tick intact | Unit with a throwing fake | The observable outcome is what the tick still did |
| Pruning is ranged, not a scan | Integration with the query counter | The existing budget harness is the only thing that can see this |
| The three overdue messages | Unit over `resultState` | It is already a pure function and already has a decision table |
| The message on the real dashboard | UI + axe | The bug would be in the rendering, and the states differ only in data |
| No extra round trip | Integration, query budget | A ratchet at the measured value, per the existing convention |

## Out Of Scope

- **Recording anything but the scheduler.** Requests, Slack interactions and
  sign-ins keep the platform's retention. The scheduler is unattended, which is
  what makes forgetting it expensive.
- **A maintainer's page.** Phase 3 is deliberately a decision rather than a
  design: the dashboard message may well be enough, and a page nobody opens is
  worse than no page. Specified when the reading is wanted, not before.
- **Alerting.** Still nothing pages anybody.
- **A shared identifier with the audit log.** Checked, and there is nothing to
  join: the scheduler writes no audit entries, and all ten change types are
  human actions.
