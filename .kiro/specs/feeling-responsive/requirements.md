# Requirements Document

## Introduction

Matt walked production on 2026-09-15 and said the application felt "generally a
little slow", with the navigation menu filling in — some options, then the rest
popping in later.

Both observations were accurate and neither was a rendering bug.

The first cause was geography: `x-vercel-id` read `lhr1::iad1::…`, so requests
entered at London and executed in Washington against a database in Dublin. Every
query crossed the Atlantic and came back, measured at ~60ms each. That is fixed —
the functions now run in `dub1` and a query costs ~9ms — and it is recorded here
because it is what made the rest visible rather than merely inefficient.

What remains is architectural. Every page is a client component that fetches on
mount, so nothing renders until the JavaScript arrives and the requests it makes
begin. A dashboard load asks the server four times, including **twice for the
same identity**, and the queries inside each request are sequential awaits —
about nineteen round trips in all. The navigation shell then honestly renders the
destinations it can name before `/api/me` resolves, which is the filling-in Matt
saw.

None of this was wrong when it was written. A duplicate `/api/me` costing one
local query was a fair price for a page that stands on its own; the same call
costing five transatlantic round trips is not. What changed is the distance, and
then the number of things depending on it.

The risk this milestone exists to close is not the current slowness. It is that
nothing in the suite can tell when it comes back.

## Glossary

- **Round trip**: one query from the function to the database and back. Now ~9ms
  within Dublin; it was ~60ms across the Atlantic.
- **Waterfall**: requests that cannot start until an earlier one finishes, so
  their latencies add rather than overlap.
- **Pop-in**: content appearing after first paint and displacing what is already
  on screen.
- **Ratchet**: a budget set at what the code does today, which fails when it
  grows. Not a target — a decision point.

## Requirements

### Requirement 1: Identity Is Resolved Once

**User Story:** As a team member, I want a page to be ready when it appears, so that I am not watching it assemble itself.

*A dashboard load fetches `/api/me` twice — once for the navigation shell, once for the page's role check — and each costs five sequential queries.*

#### Acceptance Criteria

1. A page load SHALL resolve the signed-in member's identity at most once.
2. WHERE a page needs roles or team, THE identity SHALL reach it without a second request.
3. THE page SHALL remain renderable in isolation, since a page that only works inside one layout is a page nobody can test.
4. `GET /api/me` SHALL continue to exist for genuinely client-side callers, such as the session page asking whether its reader has an application to return to.

### Requirement 2: The Navigation Arrives Whole

**User Story:** As a team member, I want the menu to be complete when I first see it, so that I am not choosing from a list that is still changing.

#### Acceptance Criteria

1. THE navigation SHALL render its full set of destinations in its first paint for a signed-in member.
2. THE application SHALL NOT displace content the member is already reading in order to add a destination.
3. WHERE identity cannot be resolved, THE shell SHALL behave as it does today — the page explains itself and the navigation does not pretend.

### Requirement 3: A Request Does Not Queue Work It Could Overlap

**User Story:** As a delivery manager, I want the dashboard to load in one visible step, so that it reads as a working tool.

*The queries within a route are sequential awaits. Several of them do not depend on each other.*

#### Acceptance Criteria

1. WHERE two queries in a request do not depend on each other, THEY SHALL run concurrently.
2. THE number of queries a route issues SHALL NOT grow without the change being visible in review.
3. Correctness SHALL be unchanged: no route may drop a query it needs in order to meet a budget.

### Requirement 4: The Budgets Are Kept By Tests, Not By Vigilance

**User Story:** As whoever maintains this next, I want a regression to fail a run, so that the application does not drift back while every test stays green.

*This milestone's real deliverable. The slowness was found by a person using the application, which is where every significant defect in this project has been found — and that is exactly what a suite is supposed to make unnecessary.*

#### Acceptance Criteria

1. THE suite SHALL fail when a page load makes more server requests than its budget allows.
2. THE suite SHALL fail when a route issues more database queries than its budget allows.
3. THE suite SHALL fail when an authenticated page shifts its layout after first paint beyond an agreed threshold.
4. THESE budgets SHALL be set at what the code does once this milestone lands, so that any growth is a decision rather than a drift.
5. THE budgets SHALL NOT be wall-clock timings in CI, which vary with the machine and would be disabled within a month.

### Requirement 5: The Production Measurement Is Repeatable

**User Story:** As a delivery manager, I want to be able to check whether it is still fast, so that "it feels slow" can be answered with a number.

#### Acceptance Criteria

1. THE repository SHALL document how to measure production response times, including which endpoint isolates database latency from function latency.
2. THE documentation SHALL record the measurements taken on 2026-09-15, before and after the region change, as the baseline to compare against.
3. THE measurement SHALL be a deliberate command, not a CI gate.

## Non-Functional Requirements

### NFR 1: Responsiveness

1. A dashboard load SHALL make at most 2 server requests for its data.
2. `GET /api/me` SHALL issue at most 5 database queries; `GET /api/teams/[teamId]/trends` at most 7. Ratchets, set at today's counts.
3. Authenticated pages SHALL record a Cumulative Layout Shift below 0.1.

### NFR 2: No Regression In What Already Works

1. Every existing behaviour test SHALL pass unchanged, or its change SHALL be justified in the commit that makes it.
2. Accessibility coverage SHALL be unchanged: pages that are audited today SHALL still be audited, in the same states.
