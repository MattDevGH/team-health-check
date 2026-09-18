# Requirements Document

## Introduction

A delivery manager walked the whole loop on production on 2026-09-14: opened a
check, answered it, closed it, and went to read the results. Everything worked.
Almost nothing explained itself.

The dashboard showed no data for five minutes because materialisation runs on
the next scheduler tick, and said nothing. Then it showed no data permanently
because one response is below the anonymity threshold, and said nothing about
that either. Two entirely different silences, indistinguishable from each other
and from "the tool is broken".

Submitting answers produced no confirmation and no way onward — a form, then the
same form, with a button that read exactly as it had before anything was saved.
Pressing it again looked like submitting again.

And the profile page offers four settings with no explanation of what any of
them does. Availability can be set and then neither seen nor cancelled.

None of this is a bug in the sense of code doing the wrong thing. Every one of
them is the application declining to say what it knows, and the cost is a user
who cannot tell working from broken.

The separate privacy defect found in the same session — trend indicators
bypassing the anonymity threshold — was fixed immediately and is not in scope
here.

## Glossary

- **Materialising**: computing a closed check's aggregates, done by a scheduler
  tick at least 30 seconds after close. Between close and that tick, a closed
  check has results that do not exist yet.
- **Suppressed**: a value hidden because fewer than three people answered, in a
  team that was promised anonymity. Not the same as unanswered, and not the same
  as not-yet-computed.
- **Contributor**: a team member who is not a Delivery Manager.
- **Away period**: a range during which a member is not prompted.

## Requirements

### Requirement 1: An Empty Dashboard Says Why

**User Story:** As a delivery manager, I want to know why I am looking at no data, so that I can tell a working tool from a broken one.

*Three different states currently render as the same blankness: results not yet computed, results suppressed for anonymity, and nobody answered.*

#### Acceptance Criteria

1. WHERE a closed check has no aggregates yet, THE dashboard SHALL say results are being prepared rather than showing nothing.
2. THAT message SHALL say the wait is minutes rather than leaving the reader to guess whether to refresh.
3. WHERE a value is suppressed for anonymity, THE dashboard SHALL say so and say how many responses are needed.
4. THE application SHALL distinguish *suppressed*, *not yet computed*, and *nobody answered* wherever any of them can occur.
5. THE explanation SHALL appear on the panels a reader actually looks at, not only in a drill-down they may never open.

### Requirement 2: Submitting Answers Has An Ending

**User Story:** As a team member, I want to know my answers were saved and what to do next, so that I am not left staring at a form wondering whether it worked.

#### Acceptance Criteria

1. WHEN a member submits, THE page SHALL confirm the answers were saved.
2. THE confirmation SHALL say answers can still be changed until the check closes, because they can.
3. THE page SHALL offer a way onward rather than ending in a form with nowhere to go.
4. WHERE a member has already submitted, THE control SHALL read as changing an answer rather than as submitting for the first time.
5. THE member SHALL still be able to edit and resubmit, since the product allows revision until close.
6. THE confirmation SHALL appear where the member's attention already is — with the control they pressed — rather than somewhere they have to go looking for.
7. WHEN a member changes an answer and saves again, THE confirmation SHALL differ visibly from the one already on screen, so that a successful update cannot be mistaken for nothing having happened.

*6 and 7 were added on 2026-09-18, from the production pass for
`reaching-your-health-check` phase 4.2 — the first time anybody answered a
check on the deployed application through the interface.*

*He submitted from the bottom of a five-question form and thought nothing had
happened; the confirmation was at the top, off screen. Then he changed an
answer and saved again, and nothing on the page moved: the control still read
"Update responses" and the confirmation from the first save was still sitting
there saying the same words.*

*Criterion 1 was met both times. The page did confirm. A confirmation nobody
sees, and a confirmation that cannot be told from the last one, are two ways of
failing a requirement that reads as satisfied — which is why they are written
down separately rather than folded into 1.*

### Requirement 3: A Contributor Is Not Offered What They Cannot Use

**User Story:** As a team member, I want the navigation to show me things I can act on, so that the tool does not look like it is refusing me.

*The dashboard already hides its Delivery-Manager controls by role. Settings does not: the nav offers it to everyone while every write behind it is manager-only.*

#### Acceptance Criteria

1. THE navigation SHALL NOT offer Settings to a contributor.
2. THE dashboard SHALL remain available to every member, since the data there is aggregate and anonymised and a team should be able to read its own results.
3. Existing role gating within the dashboard SHALL be unchanged.
4. WHERE a contributor reaches a manager-only route directly, THE behaviour SHALL be unchanged by this work — route authorisation is a separate concern from what navigation advertises.

### Requirement 4: Settings Explain Themselves

**User Story:** As a team member, I want to know what a setting does before I change it, so that I am not guessing.

*The profile page offers cadence preference, reminders, availability and Slack linking. None of them says what it affects.*

#### Acceptance Criteria

1. Cadence preference SHALL explain what weekly and micro-pulse mean in terms of what the member will be asked.
2. THE reminders toggle SHALL say which notifications it governs, and SHALL make clear it does not affect sign-in.
3. Availability SHALL explain that it stops prompts for a period, and what happens to a check that is already open.
4. Slack linking SHALL explain what linking does and how to obtain a pairing code, beyond naming the command.
5. Each explanation SHALL sit with its control rather than in a separate help section.

### Requirement 5: An Away Period Can Be Seen And Cancelled

**User Story:** As a team member, I want to see the away period I set and cancel it, so that a change of plan does not leave me silently unprompted.

*Availability can currently be set and then neither seen nor undone.*

#### Acceptance Criteria

1. THE profile page SHALL show any away period the member has set, with its dates.
2. THE member SHALL be able to cancel an away period.
3. WHERE no away period is set, THE page SHALL say so rather than showing an empty control.
4. Cancelling SHALL take effect immediately for prompt eligibility.
5. A member SHALL only see and cancel their own away periods.

## Non-Functional Requirements

### NFR 1: Explanations Are Part Of The Control

1. Copy that explains a control SHALL be associated with it programmatically, not merely placed near it.
2. An explanation SHALL be available to a screen reader in the same terms a sighted reader gets.

### NFR 2: Accessibility

1. Every new state and control SHALL meet the standing bar: axe against WCAG 2.1 AA, asserted semantics, keyboard operation driven end to end.
2. Any new colour SHALL be checked against its background with headroom, not against the threshold.

### NFR 3: Saying Nothing Is A Defect

1. Where the application knows why something is absent, it SHALL say so.
2. A state that renders as blank SHALL be treated as unfinished rather than acceptable.
