# Knowing what happened

Requirements: Knowing What Happened 2.4, NFR 2.1

The application writes a record of what it does at its boundaries — the
scheduler, deliveries, refusals, and errors it did not expect. Nothing else. An
agent can reconstruct what the code *would* do in seconds; nothing can
reconstruct what it *did* at 15:30 on a Monday, and that is the only part worth
writing down.

Each record is one line of JSON on standard output, which the hosting platform
captures. No service, no account, no network call.

## What to look at first

**The scheduler's response.** cron-job.org can show the body of every call it
makes — but only once the job has **save responses** enabled, which it is not by
default, and then only for the last 50 executions over two days. See
`docs/deployment.md`. With it on, the fastest answer to "did it run, and what
did it do?" is on a screen you already have:

```json
{
  "ok": true,
  "summary": "Ran and opened 1 check, prompting 3 members, computed results for 2 checks.",
  "tickId": "p852iwt2",
  "opened": 1,
  "closed": 0,
  "materialised": 2,
  "prompts": 3,
  "failures": 0,
  "durationMs": 412,
  "reasons": {}
}
```

The body is sent indented and in that order deliberately: the sentence first,
then what happened, then what it cost, then the breakdown. On one line it is
something you pick apart rather than read.

It used to return `{ "ok": true }` whatever happened, which made a broken Monday
look exactly like an ordinary Wednesday. Then it returned the counts, which was
better and still not enough: `"opened": 0` is the correct outcome on a Wednesday
and a failure on Monday at 15:30, and no number tells the two apart.

`summary` is the field to read. When nothing opened it says why, and counts the
teams each reason applied to:

```json
{ "summary": "Ran, nothing was due: 2 teams outside the collection window, 1 team with no schedule configured.",
  "opened": 0, "closed": 0, "materialised": 0, "prompts": 0,
  "reasons": { "outside the collection window": 2, "no schedule configured": 1 } }
```

The commonest reason comes first, because it is the state of the system. Two
sentences are worth telling apart: *"nothing was due"* means teams were
considered and passed over, and *"no teams to check"* means there were none to
consider — which on a live installation is itself the problem.

`reasons` carries the same breakdown for anything that parses the body. It is
the same set the `tick.skipped` lines carry, by construction: the tick counts a
reason at the moment it records one, and a test compares the two. The reasons
are a shared list, and one added to the scheduler without a phrase to read it
out by is a compile error.

**Then the logs**, filtered by `tickId` from that response. Every line one run
produced carries the same one.

**Both forget quickly.** Vercel's Hobby plan keeps runtime logs for **one hour**,
and cron-job.org keeps the last **50 executions** — which is between fifty
minutes and four hours depending on the tick interval, and never reaches the
two-day body cap at any interval under about an hour. What survives is the most
recent fifty rather than the most interesting: on a weekly cadence the ticks that
actually opened or closed a check are evicted within hours by the quiet ones.

**The heartbeat outlives both.** Every tick — including one that did nothing —
writes a single row to `SchedulerHeartbeat` in the application's own database,
carrying the same tick id and the same sentence the response carried. It is
replaced rather than appended, so reading it stays one lookup for ever:

| Column | Says |
|---|---|
| `ranAt` | when the scheduler last ran — the answer to "has it stopped?" |
| `summary` | what it did, in the sentence above |
| `tickId` | ties it to whatever log lines survive |
| counts | `opened`, `closed`, `materialised`, `prompts`, `durationMs` |

**No row at all means the scheduler has never run**, which is a different fault
from a stopped one and looks like a misconfigured `CRON_SECRET`.

A failed heartbeat never fails the tick; it appears as `tick.record.failed`
with the tick id and the reason. A successful one says nothing, because three
hundred lines a day reporting the expected thing is how a log stops being read.

**And the ledger answers "what happened on Monday".** `SchedulerTickRecord`
holds one row per tick that *did something* — opened, closed, materialised or
prompted anything, or failed at any of it — with the same sentence, counts and
skip reasons the response carried.

Quiet ticks are deliberately absent. They are the overwhelming majority, the
heartbeat has already said the scheduler ran, and keeping them is precisely what
leaves a record holding fifty "nothing was due" entries and no trace of the
morning a check opened. **What is kept is chosen by what happened, not by when.**

A tick that failed to materialise is kept *although every count is zero* — it is
eventful because nothing happened, and `session.materialise.failed` retries for
ever if the cause is permanent, so it is the most valuable row in the table.

**Retention is 90 days**, pruned by the tick itself: long enough to answer a
question asked the following week, and it needs nothing scheduled of its own. On
a weekly cadence the prune deletes nothing almost every time and costs one
indexed statement. A prune that fails is reported as `tick.prune.failed` and
never costs the tick the row it came to write.

Neither table holds a member id, an email address, a token, a score or a trend.

## The events

### The scheduler

| Event | Level | Means |
|---|---|---|
| `tick.started` | info | A run began. Carries `tickId`. |
| `tick.finished` | info | It ended. Carries the counts and `durationMs`. |
| `session.opened` | info | A check was opened. `teamId`, `sessionId`. |
| `session.closed` | info | A check was closed. |
| `session.materialised` | info | A closed check's results were computed. |
| `session.materialise.failed` | error | They could not be. Retried next tick — **for ever, if the cause is permanent**, which is why this is recorded rather than swallowed. |
| `tick.skipped` | info | A team was passed over, with `reason`. |

`tick.skipped` is the one to read when nothing happened and you expected
something. Its `reason` is one of:

- `no schedule configured` — nobody has set the team's times
- `team archived`
- `outside the collection window` — the cycle has passed; opening now would
  prompt a team after the fact
- `this cycle has already been served` — it ran, and this is a later tick in the
  same week
- `a check is already collecting` — one is open right now

Five different silences. They all looked identical from outside, which is why
the dashboard has a *"Results are overdue — the scheduler may not be running"*
state: it was the only way a reader could tell.

### Deliveries

| Event | Level | Means |
|---|---|---|
| `notification.<type>.delivered` | info | A message reached the sink. Carries `memberId`. |
| `notification.<type>.failed` | error | It did not, with the reason. |
| `slack.delivery.exhausted` | error | Three attempts, all failed. Carries `channel` and `attempts`. |
| `magic-link.delivery.failed` | error | A sign-in email could not be sent. |

`<type>` is `slack_prompt`, `closing_reminder`, `mid_session_nudge` or
`pre_session_notification`. They are separate names on purpose: a reminder that
rendered identically to an opening prompt once passed its tests for an entire
milestone, and two events that cannot be told apart in a log would repeat that
at a distance.

**`magic-link.delivery.failed` cannot always say who.** Somebody signing in to
create a team has no member id yet, and the address is deliberately not
recorded. That is the cost of two promises kept elsewhere — anti-enumeration,
and ids rather than addresses in logs — and it is the right trade: a member can
be found through their team, and an address in a log file cannot be taken back.

### Requests and sign-in

| Event | Level | Means |
|---|---|---|
| `request.failed` | error | An unexpected error. Carries `route`. |
| `signin.ambiguous` | error | One address matches members on several teams; no link issued. |
| `signin.ambiguous.member` | error | One of those members, with `memberId` and `teamId`. |

Expected errors — a 404, a validation failure — are **not** recorded. They are
the system working, and recording them would bury the ones that matter.

## What a record never contains

- **No answer.** No score, no trend indicator, no free text a member wrote. The
  product hides a score until three people have answered; a log line carrying
  one would step around all of it.
- **No token or secret.** Not by name, and not inside a message: anything
  token-shaped in prose is replaced with `[redacted]`.
- **No email address.** Ids instead — they are already in the database, and an
  address is the person.

This is an allowlist, enforced by a property test over arbitrary input rather
than by care. Anything a caller invents is absent unless it was named in
`ALLOWED_KEYS`.

**Redaction applies to prose only** — `message`, `reason`, `route`. It was
applied to every field at first and ate the ids: a team id is thirty-six
characters of letters, digits and hyphens, which is exactly what a session-token
pattern matches, so every event came out saying `teamId: "[redacted]"`. The
record was destroying the one thing it exists to carry. An id field cannot hold
a token, because the allowlist decides what an id field is.

## Joining a record to the audit log

The audit log is what a **delivery manager** reads: "Schedule changed", in
words, at `/teams/<id>/audit-log`. These events are what an **engineer** reads.

They join on the audit entry's id, which appears in both: on the page as
`data-change-type`'s sibling in the DOM, and in an event as `auditEntryId`. A
manager never has to read a token, and nobody debugging has to guess which
change a line refers to.

**The join only exists for things a person did.** All ten change types —
`schedule_change`, `member_added`, `privacy_mode_changed` and the rest — are
human actions; the scheduler writes no audit entries at all. So there is no
audit entry to find for a check the scheduler opened, and looking for one is a
dead end. The two records are complementary rather than overlapping, which is
also the answer to whether they want a shared identifier: there is no join to
make.

## Retention is the platform's, not ours

**Checked 2026-09-16: Vercel's Hobby plan keeps runtime logs for one hour.**
Pro is one day by default, 30 with Observability Plus. So on the current plan
every event above is gone within the hour, and "we have logs" and "we can look
at last month" are different claims — only one of them is free.

Nothing here is shipped anywhere, aggregated, or alerted on. If a stopped
scheduler needs to notify somebody rather than wait to be noticed, that is a
separate decision with a separate cost.
