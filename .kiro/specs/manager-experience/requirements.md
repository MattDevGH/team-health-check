# Requirements Document

## Introduction

Integration hardening made the application work. It did not make it usable
unaided.

A delivery manager can currently reach the dashboard, settings, and profile only
by typing URLs: there is no navigation of any kind. More seriously, the
product's central action has no interface at all — opening and closing a health
check session is possible only through the API or by waiting for the scheduler.
The end-to-end journey documents this by reaching for the API at exactly that
point, and says so in a comment.

This spec closes the gap between "the system works" and "a delivery manager can
run it themselves", ahead of a trial with a real team and sharing with
colleagues who will each run their own team.

It deliberately does **not** add multi-team membership. Requirement 5 instead
makes the existing single-team assumption fail loudly rather than silently
signing someone into the wrong team, and documents the limitation. Proper
multi-team support is a separate spec because it touches identity resolution,
Slack linking, and every team-scoped query.

## Glossary

- **Navigation_Shell**: A shared, responsive layout wrapping authenticated pages,
  providing links to the dashboard, settings, audit log, and profile, plus sign
  out. Rendered only for authenticated members.
- **Lifecycle_Control**: A UI affordance through which a Delivery Manager opens
  or closes a Health_Check_Session, replacing direct API calls.
- **Session_State**: The manager-visible status of a session — scheduled, open,
  closed awaiting materialisation, or materialised — together with the response
  count and close time.
- **Empty_State**: What a page shows before the data it exists to display is
  available, such as a dashboard before two sessions have closed.
- **Ambiguous_Identity**: An email address matching more than one TeamMember row,
  which the current schema permits and magic-link sign-in cannot resolve.

## Requirements

### Requirement 1: Shared Navigation

**User Story:** As a delivery manager, I want to move between the dashboard, settings, and my profile without knowing URLs, so that I can use the tool without being told where things are.

#### Acceptance Criteria

1. WHEN an authenticated member views any authenticated page, THE Web_Interface SHALL render a Navigation_Shell containing links to the team dashboard, team settings, and the member profile.
2. THE Navigation_Shell SHALL indicate which destination is currently active, using a means that does not rely on colour alone.
3. IF the authenticated member does not hold the delivery_manager role, THEN THE Navigation_Shell SHALL omit links to Delivery-Manager-only destinations rather than rendering links that will return 403.
4. THE Navigation_Shell SHALL provide a sign-out control that invalidates the session server-side and returns the member to the home page.
5. THE Navigation_Shell SHALL be operable by keyboard alone, expose the current page to assistive technology, and provide a skip-to-content link as its first focusable element.
6. WHEN the viewport is narrow, THE Navigation_Shell SHALL remain usable without horizontal scrolling.
7. THE Navigation_Shell SHALL NOT be rendered on unauthenticated pages, so that the sign-in flow is unchanged.

### Requirement 2: Session Lifecycle Control

**User Story:** As a delivery manager, I want to open and close health check sessions myself, so that I can run a check when the team needs one rather than only when the schedule fires.

#### Acceptance Criteria

1. WHEN a Delivery Manager views the team dashboard and no session is open, THE Web_Interface SHALL offer a Lifecycle_Control to open a session.
2. WHEN a Delivery Manager opens a session through the Lifecycle_Control, THE Web_Interface SHALL confirm success and display the resulting Session_State without requiring a manual page reload.
3. WHEN a session is open, THE Web_Interface SHALL offer a Lifecycle_Control to close it, and SHALL require an explicit confirmation step before closing.
4. THE Web_Interface SHALL display the current Session_State, including whether responses are still being collected, how many members have responded, and when the session is scheduled to close.
5. IF a lifecycle operation fails, THEN THE Web_Interface SHALL display the server's error message and leave the displayed Session_State unchanged.
6. IF the authenticated member is not a Delivery Manager, THEN THE Web_Interface SHALL NOT render Lifecycle_Controls.
7. WHEN a session has closed but its aggregates have not yet been materialised, THE Web_Interface SHALL say so explicitly rather than presenting the session as though it has no data.

### Requirement 3: Dashboard Comprehension

**User Story:** As a delivery manager, I want the dashboard to explain what it is showing me, so that I can interpret a trend without having to know how the tool was built.

#### Acceptance Criteria

1. THE trend chart SHALL carry a title and a short explanation of what is plotted.
2. THE trend chart SHALL identify which line belongs to which question by a means other than colour alone.
3. THE Web_Interface SHALL make each plotted value — question name, score, session date, and response count — available to keyboard and assistive-technology users, not only to a pointer.
4. WHERE a pointer-only affordance such as a tooltip is provided, THE same values SHALL be reachable without a pointer.
5. THE Web_Interface SHALL NOT expose which individual gave which response, regardless of privacy mode, unless a deliberate product decision and supporting data contract are added.
6. THE Latest Session panel SHALL either be removed or SHALL show the session date, average score, change from the previous session, and response count, with copy explaining its purpose.
7. WHERE a count is displayed with a noun, THE Web_Interface SHALL use grammatically correct singular and plural forms.
8. THE question rows on the dashboard SHALL indicate that they expand, SHALL convey their expanded or collapsed state through `aria-expanded`, and SHALL associate the disclosure with its content through `aria-controls`.
9. THE question disclosure SHALL be operable by keyboard.

### Requirement 4: First-Run Guidance

**User Story:** As a delivery manager using the tool for the first time, I want it to tell me what to do next, so that I do not need a written guide to get started.

#### Acceptance Criteria

1. WHEN a team has no members other than its creator, THE Web_Interface SHALL prompt the Delivery Manager to add members and link to where that is done.
2. WHEN a team has no schedule configured, THE Web_Interface SHALL prompt the Delivery Manager to configure one and explain what the schedule controls.
3. WHEN a team has no closed sessions, THE dashboard SHALL explain that trends appear after sessions close, rather than presenting an empty chart.
4. WHEN a team has exactly one closed session, THE dashboard SHALL explain that a second session is required before trends can be compared.
5. THE Web_Interface SHALL explain, at the point of use, that anonymous mode suppresses per-question detail below the anonymity threshold, so that suppressed values do not read as missing data.
6. Guidance SHALL disappear once the condition it describes is satisfied.

### Requirement 5: Ambiguous Identity Guard

**User Story:** As a delivery manager sharing this tool with colleagues, I want sign-in to fail safely if my email matches more than one team member, so that I am never silently signed into the wrong team.

*The schema permits the same email across multiple teams — `TeamMember` is unique on `(teamId, name, email)` — while magic-link sign-in resolves an email with `findFirst`, which returns an arbitrary row. Multi-team membership is out of scope; this requirement makes the limitation safe and visible.*

#### Acceptance Criteria

1. IF a Delivery Manager adds a member whose email already belongs to a member of another team, THEN THE Team_Service SHALL reject the addition with a typed error naming the conflict, and SHALL NOT create the member.
2. THE rejection SHALL occur before any member record or audit entry is written, so that a rejected addition leaves no trace.
3. WHEN an email address matches exactly one TeamMember, THE Auth_Service SHALL resolve it as it does today.
4. IF an email address matches more than one TeamMember, THEN THE Auth_Service SHALL treat the identity as ambiguous, SHALL NOT issue a magic link, and SHALL NOT authenticate the request as any of them.
5. WHEN an Ambiguous_Identity is detected, THE system SHALL log it with enough detail to identify the affected email and the teams involved.
6. WHEN an Ambiguous_Identity is detected during a magic link request, THE HTTP response SHALL be indistinguishable from any other magic link request, so that the anti-enumeration property is preserved.
7. THE Slack pairing flow SHALL be unaffected: `SlackIdentityLink.memberId` is already unique, so a Slack account maps to exactly one member.
8. THE documentation SHALL state that a person may belong to only one team, that colleagues sharing the tool should each run their own team, and how an administrator resolves a conflict that predates the guard.

## Non-Functional Requirements

### NFR 1: Accessibility

1. Every state introduced by this spec SHALL pass axe with the WCAG 2.1 A and AA rule sets, matching the existing suite.
2. Every interactive control introduced by this spec SHALL be reachable and operable by keyboard alone.
3. The Navigation_Shell and Lifecycle_Controls SHALL be verified by a manual keyboard pass, recorded in the tasks document. Automated checks detect roughly a third to a half of WCAG issues and cannot confirm conformance alone.

### NFR 2: No Regression in Evidence

1. The end-to-end journey SHALL be updated to drive session open and close through the UI once Lifecycle_Controls exist, removing the API calls it currently documents as a workaround.
2. The dashboard end-to-end tests SHALL locate the question disclosure through its accessible relationship rather than a CSS class, once Requirement 3.7 provides one.
3. The Playwright suite SHALL continue to run with zero skips.
