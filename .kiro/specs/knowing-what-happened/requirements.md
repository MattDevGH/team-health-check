# Requirements Document

## Introduction

The application keeps no record of what it does.

Eleven `console` calls exist in the whole codebase, all but one in a catch
block, and the longest-running thing in the system — the scheduler tick that
opens checks, closes them, computes their results and sends every prompt — logs
nothing at all. It returns `{ ok: true }` whatever it did. The cron service that
calls it every day receives a 200 and no information.

The cost is already paid. The dashboard says *"Results are overdue — the
scheduler may not be running"* because a stalled scheduler is indistinguishable
from a silent team **from the outside**, and there was no inside to look at. That
message is a user interface compensating for an absent record. One of the
deployment spec's open tasks — "establish how a stopped trigger would be
noticed" — is the same gap approached from the other side.

The five log lines that do exist say things like `Slack delivery failed after 3
attempts: Error`. Not which member, which team, which session, or which check.
A line that cannot be attributed is a line that cannot be acted on.

## What this is not

Matt asked whether comprehensive logging is still worth having when an agent can
read the code in seconds. It is worth having **less** of, and the part worth
keeping is different from the old habit.

An agent can reconstruct what the code *would* do. Nothing can reconstruct what
it *did* at 15:30 on a Monday in production. So: record decisions and outcomes at
the edges, where the system meets the world and where the past cannot be
re-derived. Do not narrate internal steps — that was always a substitute for
reading the code, and it is now a substitute for something much cheaper.

## Glossary

- **Boundary**: where the application acts unattended or talks to something
  outside itself — the scheduler tick, Slack, email, the database when it
  refuses.
- **Event**: one record of something that happened, with a stable name and
  enough context to say who it was about.
- **Context**: the ids that make an event attributable — team, session, member.
  Never the content of an answer.

## Requirements

### Requirement 1: The Unattended Job Says What It Did

**User Story:** As the maintainer, I want the scheduler's decisions recorded, so that "why did no check open on Monday?" is answered by reading rather than by guessing.

*This is the whole reason for the milestone. The tick makes six decisions per team per run — archived, no schedule, close due, open due, already served, materialise — and records none of them.*

#### Acceptance Criteria

1. THE scheduler tick SHALL record that it ran, including when, and how long it took.
2. WHERE the tick opens, closes or materialises a session, IT SHALL record which team and which session.
3. WHERE the tick declines to act on a team, IT SHALL record why — no schedule, archived, outside the collection window, or the cycle already served.
4. THE tick's HTTP response SHALL carry a summary of what it did, because the response is the only place the tick can leave one where an operator will meet it, and nobody reads server logs on a schedule.
5. THE summary SHALL be counts and ids, never the content of any answer.
6. THE summary SHALL state in plain language what the tick did, and where it
   did nothing, why — without requiring the reader to know what the field
   names mean.

*Criterion 6 was added after the first tick reached a live cron dashboard.*
*The response was `{ opened: 0, closed: 0, materialised: 2, prompts: 3 }`, which*
*satisfied criteria 1 to 5 and still could not be acted on: `opened: 0` is the*
*correct outcome on a Wednesday and a failure on Monday at 15:30, and no count*
*distinguishes them. The verdict at the time was that it needed "a reminder of*
*what it’s telling me" — and a record that needs a reminder is not a record*
*that can be read at a glance.*

*Criterion 4 read "since the cron service that calls it **shows the response**"*
*until 2026-09-16. It does not, by default. cron-job.org shows `200 OK` and*
*nothing else unless the job has **save responses** switched on, and then it*
*keeps headers and bodies for the last 50 executions over two days. The clause*
*was an assumption about a third party's interface that nobody had checked, and*
*the person who first opened a real dashboard found the summary sitting*
*somewhere they could not read it.*

*The criterion survives the correction because the reasoning was only ever*
*half about cron-job.org: the response is the one artefact the tick controls,*
*and a server log nobody reads on a schedule is not an answer. What does not*
*survive is treating a third party's default as a premise. Making the body*
*visible is a deployment step now, in `docs/deployment.md`, and two days of*
*retention is thin enough that where else the summary should live is recorded*
*as open work rather than settled here.*

### Requirement 2: A Record Says Who It Is About

**User Story:** As whoever is debugging, I want a log line to name the team and session it concerns, so that one failing member is distinguishable from a broken system.

*`Slack delivery failed after 3 attempts: Error` is the current standard. It cannot be attributed, correlated, or acted upon.*

#### Acceptance Criteria

1. Every event SHALL carry the ids relevant to it — team, session, member — where they are known.
2. Every event SHALL carry a stable event name, so that events of one kind can be found together.
3. All events from one scheduler tick SHALL share an identifier, so a run can be read as a run.
4. WHERE an event concerns an audit log entry, IT SHALL carry that entry's id, so the record a manager reads and the record an engineer reads can be joined.

### Requirement 3: Delivery Outcomes Are Recorded

**User Story:** As the maintainer, I want to know whether a prompt reached somebody, so that "I never got a message" is a question with an answer.

#### Acceptance Criteria

1. WHERE a Slack or email delivery succeeds, THE outcome SHALL be recorded with the member it was for.
2. WHERE a delivery fails, THE failure SHALL be recorded with the member, the channel, and the reason.
3. A failure to record SHALL NOT prevent a delivery, and a failure to deliver SHALL NOT prevent the record.
4. THE record SHALL distinguish a prompt from a reminder, because they have been confused before: a reminder that rendered identically to an opening prompt passed its test for an entire milestone.

### Requirement 4: A Record Is Readable By Machine

**User Story:** As whoever is looking, I want to filter to one team or one event, so that finding the relevant line does not mean reading all of them.

#### Acceptance Criteria

1. Events SHALL be written to standard output as single-line JSON, which the hosting platform captures and indexes.
2. Each event SHALL carry a level of `info`, `warn` or `error`.
3. THE format SHALL be the same in development and production, so that what is read locally is what is read in production.
4. THE application SHALL NOT require a logging service, an account, or a network call to record an event.

### Requirement 5: A Record Never Leaks What It Should Not

**User Story:** As a team member promised anonymity, I want the logs not to contain my answers, so that a privacy promise is not undone by an operational convenience.

*This project already suppresses scores below three responses and hides trend indicators for the same reason. A log line that carried a score would step around all of it.*

#### Acceptance Criteria

1. THE logs SHALL NOT contain a response score, a trend indicator, or any free text a member wrote.
2. THE logs SHALL NOT contain a session link token, a magic link token, a session cookie, or an API secret.
3. THE logs SHALL prefer ids to names and email addresses.
4. THESE rules SHALL be enforced by a test, not by care.

### Requirement 6: Recording Cannot Break The Thing It Records

**User Story:** As a member answering a health check, I want the application to work whether or not logging does, so that an observability feature is never an outage.

#### Acceptance Criteria

1. A failure inside the logger SHALL NOT propagate to the caller.
2. Logging SHALL NOT change the outcome of the operation it records.
3. THE test suite SHALL NOT emit log lines into its own output, or a failing assertion becomes hard to find.

## Non-Functional Requirements

### NFR 1: Proportion

1. No dependency SHALL be added for this. A single module writing JSON to stdout is the whole mechanism.
2. Events SHALL be recorded at boundaries only — the unattended job, deliveries, refusals, and unexpected errors. Internal steps SHALL NOT be narrated.

### NFR 2: Retention Is Someone Else's

1. The documentation SHALL state that the hosting platform decides how long these lines survive, and that the retention window on the current plan should be checked before treating them as a historical record.
