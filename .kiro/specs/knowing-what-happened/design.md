# Design Document

## Overview

One module, a handful of call sites, and a summary in the tick's response. The
restraint is the design: every line this adds is a line somebody reads while
something is broken, and a log nobody can skim is a log nobody uses.

## Key Decisions

### 1. A module, not a library

`pino` and `winston` are good and both are more than this needs. What is
required is `JSON.stringify` and `console.log`, plus a place to decide what is
allowed in an event. That is thirty lines, no dependency, no configuration file,
and nothing to audit in a serverless application whose whole point is that it
costs nothing to run.

The bar to revisit this: wanting log levels controlled at runtime, or shipping
to somewhere other than stdout. Neither is needed to answer "did the tick run?".

### 2. JSON on stdout, because that is what the platform reads

Vercel captures a function's stdout and indexes structured lines, which makes
`event` and `teamId` filterable rather than greppable. The same format is used
locally so that what a developer reads is what production will show.

**How long those lines survive is the platform's decision, not ours** — the
retention window depends on the plan and should be checked before anything here
is treated as a historical record. Requirement NFR 2 exists to say so out loud,
because "we have logs" and "we can look at last month" are different claims.

### 3. Events are named, and the name is the contract

`scheduler.tick.started`, `session.opened`, `prompt.delivered`,
`prompt.failed`. A name is what makes a set of lines findable; a message string
is what makes them greppable, which is not the same thing.

Messages stay too, for a human reading a stream — but the name is what a filter
matches, and it changes only deliberately.

### 4. Context is ids, and the allowlist is enforced by a test

An event carries `teamId`, `sessionId`, `memberId`, `auditEntryId` — never a
score, a trend, a token, or an answer. Requirement 5.4 asks for a test rather
than care, so the logger takes a typed context and a test asserts that a
forbidden key never reaches the output.

This is not hypothetical tidiness. The project suppresses a score below three
responses and hides trend indicators at the same threshold; a log line carrying
`score: 2` steps around both.

`memberId` is deliberately allowed and email addresses are not: the id is
already in the database, the address is the person.

### 5. The tick answers in its response as well as its logs

cron-job.org can show the response body of every call it makes. That is a
dashboard Matt already has open, with no account to create — so the tick returns
what it did, as a sentence with the counts behind it:

```json
{ "ok": true, "summary": "Ran and opened 1 check, prompting 3 members, computed results for 2 checks.",
  "tickId": "…", "opened": 1, "closed": 0, "materialised": 2, "prompts": 3, "durationMs": 412 }
```

Counts, reasons and ids. The same information as the logs, in the one place
somebody is already looking.

**This section said "shows the response body" until 2026-09-16.** It does not,
by default — the *save responses* setting is off until you turn it on, and once
on it keeps the last 50 executions over two days. Two corrections followed, and
only one of them was to the wording:

- Enabling it is a deployment step now, in `docs/deployment.md`.
- Fifty executions is between fifty minutes and four hours depending on the tick
  interval, and Vercel's Hobby plan keeps the logs this compares itself to for
  **one hour**. So "the same information as the logs" is true and both halves
  forget within the afternoon. What to do about that is
  `.kiro/specs/remembering-what-happened/`.

The decision itself stands. The response is the one artefact the tick controls,
and a server log nobody reads on a schedule is not an answer. What did not stand
was treating a third party's default as a premise.

### 6. Testing a record is testing a behaviour

The project's rules say to assert the observable outcome, not that a
collaborator was called — and here the record **is** the outcome. The product
being built is the answer to "what happened", so a test asserts what the record
says: that it names the team whose check was opened, and that it says *why* a
team was skipped.

Two things follow:

- The logger takes an injectable sink, so a test can read what was written
  rather than capture stdout. The default sink is `console`.
- The suite sets a silent sink globally, so the tests do not write their own
  logs into the run's output (Requirement 6.3). A failing assertion is hard
  enough to find without a thousand JSON lines around it.

### 7. Failure inside the logger is swallowed, deliberately

A circular structure or a serialisation error must not take down a health check
submission. `try`/`catch` around the write, and nothing rethrown — the one place
in this codebase where swallowing an error is right, because the alternative is
an observability feature causing an outage.

## Correctness Properties

1. **A recorded event names what it is about.** Every event carries the ids
   known at the point it is raised.
2. **No forbidden key reaches the output.** Scores, trends, tokens and free text
   are absent whatever a caller passes.
3. **Logging is inert.** The result of an operation is identical whether its
   logging succeeds, fails, or is silenced.
4. **A tick's events share its id**, so a run reads as a run.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| What an event contains | Unit, over an injected sink | The record is the outcome; reading it back is the assertion |
| Forbidden keys never appear | Unit, property-based | An allowlist is an invariant over arbitrary input, not three examples |
| The tick records its decisions | Unit over the scheduler service | Decisions are made there, and the branches are already fixture-driven |
| The tick's response summary | Route test | The response is what the cron service shows |
| Nothing breaks when logging fails | Unit | A sink that throws, and the operation still returns |

## Out Of Scope

- **Request-level tracing.** A correlation id threaded through every route would
  answer questions nobody has yet, at the cost of a line per request on a plan
  with limited retention. Boundaries first; revisit when a question needs it.
- **Alerting.** Nothing here pages anybody. "How would a stopped trigger be
  noticed" is answered by the dashboard's *overdue* state and by a person
  looking at cron-job.org; making that automatic is a separate decision with a
  separate cost.
- **Shipping logs anywhere.** No account, no network call, no vendor.
- **Retention.** The platform's, and stated as such.

  *Revisited 2026-09-16. "The platform's" turned out to be one hour of Vercel
  Hobby runtime logs and fifty cron-job.org executions — between fifty minutes
  and four hours in total, for a milestone named after knowing what happened on
  Monday. Deferring retention was the right call at the time and it is now the
  thing that needs doing: `.kiro/specs/remembering-what-happened/`.*
