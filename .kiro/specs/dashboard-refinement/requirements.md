# Requirements Document

## Introduction

The manager-experience milestone made the dashboard explain itself. Using it
against real data showed that several of those explanations are still wrong,
missing, or quietly misleading.

This spec comes from one manual pass over the live application on 2026-08-30,
recorded verbatim in the session notes. Every requirement below traces to
something a delivery manager noticed while reading their own team's data — not
to a test failure, because none of these fail a test.

Three findings are defects rather than improvements: the profile page reads a
field its API never sends, the audit log attributes changes to a raw database
id, and a question theme nobody answered disappears from the dashboard instead of
saying so.

The rest fall into three groups: a chart that currently misrepresents time and
depends on colour alone; naming that calls a theme a question while never
showing the question; and settings a colleague cannot understand without having
been in the conversations that produced them.

## Glossary

- **Question_Theme**: one of the five fixed health areas — "Delivering Value",
  "Psychological Safety" and so on. Stored as `Question.title`. What the
  dashboard currently calls a question.
- **Question_Text**: the sentence a team member is actually asked, stored as
  `Question.description` — for example *"How well is the team delivering value
  to users and stakeholders?"*. Present in the database and shown nowhere on the
  dashboard.
- **Trend_Indicator**: the optional *improving / stable / declining* tag a
  member may attach to a question theme alongside their 1–5 score. The dashboard's Trend
  Indicators panel counts these tags.
- **Series**: one question theme's line across the trend chart.
- **Excluded_Session**: a closed health check a Delivery Manager has removed
  from the team's history, with a recorded reason.

## Requirements

### Requirement 1: A Chart That Tells The Truth About Time

**User Story:** As a delivery manager, I want the shape of a trend line to reflect when checks actually happened, so that I am not misled by my own dashboard.

*Sessions are currently plotted at even intervals regardless of date. Two checks a day apart and two checks a month apart produce identical slopes.*

#### Acceptance Criteria

1. THE trend chart SHALL position each session along the horizontal axis in proportion to when it closed, not by its position in the list.
2. WHERE two sessions closed on the same day, THE chart SHALL still render both distinguishably.
3. WHEN only one closed session exists, THE chart SHALL place it without requiring a range to divide by.
4. THE horizontal axis SHALL be labelled so a reader can tell that the spacing represents elapsed time.
5. THE accompanying data table SHALL continue to list every session in chronological order regardless of spacing.

### Requirement 2: Series Distinguishable Without Colour

**User Story:** As a delivery manager, I want to tell one line from another whether or not I can distinguish the colours, so that the chart works for everyone I show it to.

*Blue and purple were reported as hard to tell apart on a normal screen. Colour alone also fails in greyscale print and for around one in twelve men.*

#### Acceptance Criteria

1. THE chart SHALL distinguish each Series by at least one attribute other than colour.
2. THE legend SHALL carry the same distinguishing attribute as the line it names, so the mapping is readable without comparing hues.
3. THE colours SHALL remain distinguishable from one another at the contrast the surrounding page provides.
4. THE legend SHALL lay out so that entries are not orphaned onto a line of their own — either all on one line, or one per line.
5. Requirement 1's spacing and this requirement's styling SHALL both survive the chart being printed in greyscale.

### Requirement 3: Question Themes Named Honestly, With The Question Shown

**User Story:** As a delivery manager, I want to see the question my team was actually asked, so that I can interpret a score against what people were answering.

*The dashboard labels everything "question" while displaying `Question.title`, which is a theme. The real question is `Question.description`, which is currently displayed nowhere.*

#### Acceptance Criteria

1. THE Web_Interface SHALL refer to the five health areas as **question themes**, consistently across the dashboard. *(Term agreed 2026-08-31: clearer and more descriptive than "topic" or "theme" alone.)*
2. WHEN a Question_Theme is expanded, THE Web_Interface SHALL display its Question_Text.
3. THE Question_Text SHALL be available to the dashboard without a second round trip per Question_Theme.
4. Renaming SHALL NOT change any stored value, API field name, or question identifier.

### Requirement 4: Absent Data Said Out Loud

**User Story:** As a delivery manager, I want to see that a question theme went unanswered, so that I do not mistake a missing row for a theme nobody had concerns about.

*A question theme with no responses in a session is currently omitted from the Latest Session panel and skipped entirely in the expanded history. Silence and absence are indistinguishable.*

#### Acceptance Criteria

1. THE Latest Session panel SHALL list every Question_Theme the team is asked about, including those with no responses in that session.
2. WHERE a Question_Theme has no responses in the latest session, THE panel SHALL say so rather than omitting the row or leaving it blank.
3. WHEN a Question_Theme is expanded, THE history SHALL include sessions in which it went unanswered, marked as such.
4. THE distinction between *no responses* and *suppressed for anonymity* SHALL be clear: they are different facts and SHALL NOT share wording.

### Requirement 5: Settings A Colleague Can Understand

**User Story:** As a delivery manager who was not present when this tool was built, I want each setting to explain what it does, so that I can decide whether to change it.

#### Acceptance Criteria

1. THE Privacy Mode control SHALL explain what each mode does to the data a manager sees, including the anonymity threshold.
2. THE Schedule control SHALL explain what the schedule causes to happen, and what happens without one.
3. THE Slack Delivery Window control SHALL explain what it constrains and what falls outside it.
4. THE Members section SHALL explain what each role permits.
5. WHERE a member is shown as not linked to Slack, THE Web_Interface SHALL explain what that means for them and how it is resolved.
6. THE Trend Indicators panel SHALL explain that its counts are members' own assessments of direction, not a calculated trend.
7. Explanatory copy SHALL sit with the control it describes, not in a separate help page.

### Requirement 6: Changes Attributed To People

**User Story:** As a delivery manager reading the audit log, I want to see who made a change, so that the log is usable without a database.

*Entries currently read "Changed by: cmt4sfyxy0002fc0f7i08ao9i".*

#### Acceptance Criteria

1. WHERE an audit entry's actor is the member reading the log, THE Web_Interface SHALL indicate that it was them.
2. WHERE the actor is another current member of the team, THE Web_Interface SHALL show that member's name.
3. WHERE the actor is no longer a member of the team, THE Web_Interface SHALL say so rather than showing an identifier.
4. WHERE the actor is a system process or an account whose data has been erased, THE Web_Interface SHALL describe it in those terms.
5. THE audit log SHALL remain append-only and its stored values unchanged: this is a presentation concern only.

### Requirement 7: Profile Shows Only What It Knows

**User Story:** As a team member, I want my profile to show accurate information about me, so that I can trust what else it says.

*The page renders "Privacy mode:" followed by nothing, because it reads a field that `GET /api/me` does not return — privacy mode belongs to the Team, not the TeamMember.*

#### Acceptance Criteria

1. THE profile page SHALL NOT render a value it has not been given.
2. WHERE the profile displays a team-level setting, it SHALL be labelled as the team's and SHALL be read-only.
3. IF a displayed field is not meaningful for an individual, THEN it SHALL be removed rather than left blank.

### Requirement 8: Filtering The Chart

**User Story:** As a delivery manager, I want to focus on one or two question themes at a time, so that a five-line chart does not have to be read all at once.

#### Acceptance Criteria

1. THE legend SHALL allow a Series to be hidden and shown again.
2. THE control SHALL report its current state to assistive technology, and SHALL be operable by keyboard.
3. Hiding a Series SHALL affect the chart only: the data table SHALL continue to show every value.
4. Filtering SHALL NOT persist between visits — a manager returning to the dashboard SHALL see the whole picture.
5. IF every Series is hidden, THEN the chart SHALL say so rather than rendering an empty grid.

### Requirement 9: Removing A Session, With A Reason

**User Story:** As a delivery manager, I want to remove a health check that was opened in error or invalidated by events, so that our history reflects what actually happened.

*This began as a request to hide a row. Hiding it would let the dashboard be quietly made to say something other than what the team reported; removing it with a recorded reason leaves the history honest about its own gaps.*

**Roadmap, not scheduled — decided 2026-08-31.** Neither exclusion nor deletion
may ever be needed, so this requirement is recorded rather than planned. It is
kept here, in full, so that if the need arises the thinking does not have to be
redone.

Two decisions already taken:

- **Exclusion is preferred over deletion.** Responses are what team members
  wrote; destroying them to tidy a chart removes the only record that anyone
  answered. Exclusion leaves the history honest about its own gaps.
- **The schema change waits.** `excludedAt` and `exclusionReason` are both
  nullable, and *absent* is a meaningful value — not excluded. That makes the
  migration a metadata-only `ALTER TABLE ADD COLUMN` with no backfill, equally
  cheap before or after live data exists. Adding the columns speculatively would
  invite them to be used before anyone had agreed what exclusion means.

#### Acceptance Criteria

1. Only a Delivery Manager SHALL be able to remove a session.
2. THE system SHALL require a reason, and SHALL NOT accept an empty one.
3. THE removal SHALL be recorded in the audit log with the reason, the session's close date, and the actor.
4. THE audit record SHALL remain readable after the session is gone.
5. THE action SHALL require an explicit confirmation that names what is being removed.
6. THE trend chart, data table, Latest Session panel and question-theme history SHALL all stop counting a removed session.
7. IF removing a session would leave fewer than the two closed sessions a trend needs, THEN the dashboard SHALL return to its insufficient-data state rather than rendering a broken chart.

## Non-Functional Requirements

### NFR 1: Accessibility

1. Every state introduced by this spec SHALL pass axe with the WCAG 2.1 A and AA rule sets.
2. Every interactive control introduced SHALL be operable by keyboard alone.
3. Per the position recorded in manager-experience NFR 1.4, WCAG 2.1 AA is the standard aimed for continuously; a formal audit gates *claiming* conformance and does not block delivery.

### NFR 2: No Regression In Evidence

1. Renaming user-facing terminology SHALL be accompanied by updates to every test that asserts the old wording, in the same commit.
2. The Playwright suite SHALL continue to run with zero skips.
3. Any test asserting a chart value SHALL continue to cross-check against the stored aggregate rather than the component's own props.
