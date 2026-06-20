# Requirements Document

## Introduction

Team Health Check is a lightweight tool for gathering and tracking regular feedback from cross-functional delivery teams, inspired by the Spotify Squad Health Check Model. The primary goal is to make giving feedback trivially easy so that team members develop a habit of frequent check-ins. The tool targets teams working on GOV.UK/GDS products across various stages of the GDS lifecycle.

The MVP focuses on: a fixed set of health-check questions, simple feedback collection, trend visualisation over time, Slack integration for frictionless participation, and a mobile-friendly web interface as an alternative channel.

## Scope and Assumptions

### In Scope (MVP)
- Team creation and member management
- Automated and manual session lifecycle management
- Feedback collection via mobile-friendly web interface and Slack bot
- Authentication-free access via cryptographic session links and on-demand magic links
- Trend visualisation with line charts and CSV export
- Fixed set of 5 health check questions
- Individual cadence preference (weekly or micro-pulse)
- Configurable response anonymity (default anonymous)
- Session reminders, mid-week nudges, and absence management
- Instant feedback via rolling averages
- Personal engagement streaks
- Role-based access control (delivery manager and team member)
- Team configuration audit log

### Out of Scope (Future Phases)
- Customisable/team-managed question sets
- Team event journal for correlating trends to external events
- Integration with external team tracking tools (Jira, Trello, etc.)
- Integration with calendar/HR systems for automatic absence detection
- Individual notification time preferences (team-level delivery window only for MVP)
- Per-user timezone support (team-level timezone only for MVP)
- Automated ghost team detection (warning after extended inactivity with no DM)
- Multi-team views or cross-team comparison dashboards
- Native mobile application

### Assumptions
- Teams are small to medium-sized (2–30 members typical)
- The application will be deployed as a single instance (not multi-tenant SaaS) for the MVP
- Team members have access to either Slack or a web browser (or both)
- A Slack workspace is available and administrators are willing to install the bot
- The deployment environment supports scheduled task execution (e.g., cron, serverless timers) for automatic session lifecycle and prompt delivery

## Glossary

- **Health_Check_Session**: A time-bounded collection period during which team members submit their responses to the current set of questions. Each session has an open and close time.
- **Question**: A single health-check prompt presented to team members during a session. In the MVP, questions are fixed and defined by the system.
- **Response**: A single team member's answer to one question within a session, consisting of a score and an optional trend indicator.
- **Score**: A numeric value on a scale of 1 to 5 representing how a team member feels about a particular question (1 = strongly negative, 5 = strongly positive).
- **Trend_Indicator**: A team member's optional, subjective sense of whether things are improving, stable, or declining for a given question, independent of the absolute score. De-emphasised in the UI — never required for submission.
- **Team**: A named group of people who participate in health checks together.
- **Team_Member**: An individual who belongs to a team and submits responses.
- **Slack_Bot**: The Slack application integration that delivers health check prompts and collects responses within Slack workspaces.
- **Web_Interface**: The mobile-friendly Next.js web application that provides an alternative channel for submitting responses and viewing results.
- **Trend_Dashboard**: The view that displays aggregated scores over multiple sessions to reveal patterns and changes over time.
- **Session_Link**: A unique, time-limited URL that allows a team member to submit responses without requiring authentication during an active session.
- **Magic_Link**: An on-demand, short-lived authentication URL sent to a team member's email address, providing access to the web interface at any time regardless of session state.
- **Micro_Pulse**: A feedback cadence mode where a team member receives one question at a time (typically daily), with weighted random selection favouring questions not yet answered in the current session.
- **Rolling_Average**: An average Score calculated from the most recent N responses for a question across current and previous sessions, used for instant feedback to preserve anonymity when current-session participation is low.
- **Privacy_Mode**: A team-level setting controlling whether individual responses are visible to others. Defaults to "anonymous" (only aggregates shown); optionally switchable to "attributed" (individual-level data accessible).
- **Delivery_Manager**: A user assigned the administrative role for a Team, responsible for team configuration, session management, and participation oversight. See Requirement 17 for full permission definitions.
- **Slack_Identity_Link**: A verified mapping between a Team_Member's system identity and their Slack user ID, established via a one-time self-service connection command.

## Requirements

### Requirement 1: Team Creation and Management

**User Story:** As a delivery manager, I want to create and manage a team, so that I can organise health check sessions for my delivery team.

#### Acceptance Criteria

1. WHEN a user submits a team name (between 1 and 100 characters, trimmed of leading/trailing whitespace) and an optional description (maximum 500 characters), THE Web_Interface SHALL create a new Team and return a unique team identifier.
2. IF a user submits a team name that is empty or contains only whitespace, THEN THE Web_Interface SHALL reject the request and display a validation error indicating that a team name is required.
3. WHEN a user adds a team member by name (between 1 and 100 characters) and optional email address, THE Web_Interface SHALL associate that Team_Member with the specified Team.
4. IF a user provides an email address that does not conform to a valid email format, THEN THE Web_Interface SHALL reject the request and display a validation error indicating the email is invalid.
5. IF a user attempts to add a Team_Member who is already associated with the specified Team (matched by name and email combination), THEN THE Web_Interface SHALL reject the request and inform the user that the member already belongs to the team.
6. WHEN a user removes a team member from a team, THE Web_Interface SHALL disassociate that Team_Member from the Team without deleting their historical Response data.
7. THE Web_Interface SHALL display the list of current Team_Members for a given Team, or a message indicating no members have been added when the Team has zero members.
8. THE Web_Interface SHALL allow a delivery_manager to archive a Team, which SHALL immediately force-close any currently open Health_Check_Session (triggering aggregate materialisation after the quiet period), stop all scheduled sessions, suppress all Slack prompts and reminders, and prevent new sessions from being opened.
9. WHEN a Team is archived, THE Web_Interface SHALL preserve all historical data (sessions, responses, trends) and allow read-only access to the Trend_Dashboard via Magic_Link.
10. THE Web_Interface SHALL allow a delivery_manager to unarchive a Team at any time, restoring full functionality including scheduled sessions.

### Requirement 2: Slack Identity Linking

**User Story:** As a team member, I want to link my Slack account to my health check profile, so that I can receive prompts and respond directly in Slack.

#### Acceptance Criteria

1. THE Web_Interface SHALL maintain its own independent user registry as the primary source of truth for Team_Member identity, with Slack user ID as an optional linked attribute.
2. THE Slack_Bot SHALL provide a one-time self-service command (e.g., `/healthcheck connect`) that initiates the identity linking process for a Team_Member.
3. WHEN a Team_Member invokes the connect command, THE Slack_Bot SHALL generate a short-lived pairing code (valid for no more than 10 minutes) and instruct the Team_Member to enter it via the Web_Interface (accessible via their Session_Link during an active session, or via a Magic_Link at any time) to complete the mapping.
4. WHEN the pairing code is successfully submitted via the Web_Interface, THE system SHALL store the verified Slack_Identity_Link associating the Team_Member's system identity with their Slack user ID.
5. IF a pairing code has expired or is invalid, THEN THE Web_Interface SHALL reject the linking attempt and instruct the Team_Member to generate a new code.
6. THE Web_Interface SHALL allow a Team_Member to unlink their Slack identity at any time, after which they will no longer receive Slack prompts or reminders.
7. THE Web_Interface SHALL allow a delivery_manager to view which Team_Members have linked Slack identities and which have not, to facilitate onboarding support.
8. THE Slack_Bot SHALL NOT send prompts or messages to Team_Members who have not completed the Slack identity linking process.

### Requirement 3: Health Check Session Lifecycle

**User Story:** As a delivery manager, I want health check sessions to run on a regular schedule automatically, so that feedback collection happens consistently without manual intervention.

#### Acceptance Criteria

1. THE Web_Interface SHALL allow a Team to configure a recurring session schedule by specifying a cadence (e.g., weekly) and the day/time sessions open and close (e.g., opens Monday 09:00, closes Friday 17:00).
2. THE Web_Interface SHALL require each Team to configure a timezone (defaulting to Europe/London), and SHALL interpret all schedule-related times (session open/close, delivery windows, reminder timing) in that timezone.
2. WHEN a scheduled session open time is reached, THE Web_Interface SHALL automatically create a Health_Check_Session with a status of "open" and record the scheduled start time.
3. WHEN a scheduled session close time is reached, THE Web_Interface SHALL automatically set the Health_Check_Session status to "closed" and record the scheduled end time.
4. THE Web_Interface SHALL allow a user to manually open or close a Health_Check_Session at any time, overriding the automatic schedule.
5. WHILE a Health_Check_Session is open, THE Web_Interface SHALL accept Response submissions only from Team_Members belonging to that Team.
6. IF a Response submission is attempted by a user who is not a Team_Member of the session's Team, THEN THE Web_Interface SHALL reject the submission and return a message indicating the user is not a member of that Team.
7. WHILE a Health_Check_Session is closed, THE Web_Interface SHALL reject any new Response submissions for that session and return a message indicating that the session has ended and is no longer accepting responses.
8. IF a Team already has an open Health_Check_Session when a new scheduled session would open, THEN THE Web_Interface SHALL close the existing session first before opening the new one.
9. IF a user attempts to close a Health_Check_Session that is already closed, THEN THE Web_Interface SHALL reject the request and return a message indicating the session is already closed.
10. WHEN no schedule is configured for a Team, THE Web_Interface SHALL require manual session management (open and close by a user).
11. IF a configured session duration is shorter than the closing reminder lead time (default 24 hours), THEN THE Web_Interface SHALL display a warning indicating that no closing reminder will be sent for sessions of this length, and SHALL suppress the closing reminder for those sessions.

### Requirement 4: Feedback Collection via Web Interface

**User Story:** As a team member, I want to submit my health check feedback quickly on any device, so that providing feedback takes minimal effort.

#### Acceptance Criteria

1. WHEN a Team_Member opens a valid Session_Link or accesses the Web_Interface via a Magic_Link session, THE Web_Interface SHALL display Questions according to their cadence preference: for "weekly" mode, all Questions in a single scrollable view; for "micro-pulse" mode, a single unanswered Question (selected using weighted random selection per Requirement 15) with an option to expand and view all Questions.
2. WHEN a micro-pulse Team_Member expands to view all Questions, THE Web_Interface SHALL allow them to answer any or all Questions without changing their cadence preference. Unanswered Questions SHALL remain eligible for future Slack prompts.
3. THE Web_Interface SHALL render each Question with a Score input (1 to 5) and an optional Trend_Indicator selection (improving, stable, declining), with Trend_Indicator defaulting to no selection.
4. WHEN a Team_Member submits their responses, THE Web_Interface SHALL validate that every answered Question has a Score between 1 and 5 inclusive.
5. IF a Team_Member submits a Score outside the range 1 to 5 for any answered Question, THEN THE Web_Interface SHALL reject the submission and display a validation error for the affected Question.
6. WHEN a Team_Member submits valid responses, THE Web_Interface SHALL store each Response and display a confirmation message.
7. THE Web_Interface SHALL be fully usable on viewports from 320px width upward without horizontal scrolling.
8. WHEN a Team_Member has already submitted responses for a session, THE Web_Interface SHALL pre-populate the form with their previously submitted Scores and Trend_Indicators and allow them to update their responses until the session is closed.
9. IF a Team_Member attempts to submit responses after the Health_Check_Session has been closed, THEN THE Web_Interface SHALL reject the submission and display a message indicating the session has ended.
10. IF a Response submission fails due to a network or server error, THEN THE Web_Interface SHALL display an error message and retain the user's input so they can retry without re-entering data.

### Requirement 5: Feedback Collection via Slack

**User Story:** As a team member, I want to receive health check prompts in Slack and respond without leaving the app, so that giving feedback is frictionless within my existing workflow.

#### Acceptance Criteria

1. THE Web_Interface SHALL allow a Team to configure a Slack prompt delivery window defined by a start time and end time (e.g., 09:00–17:00) representing the hours during which Slack prompts may be sent.
2. WHEN a Health_Check_Session is open and a Team_Member has a "weekly" cadence preference, THE Slack_Bot SHALL send a single direct message containing interactive prompts for all Questions at the start of the configured team delivery window on the first day of the session that falls within the delivery window.
3. WHEN a Health_Check_Session is open and a Team_Member has a "micro-pulse" cadence preference, THE Slack_Bot SHALL send one direct message per day containing interactive prompts for all unanswered Questions that have accumulated since the last prompt (one question on a normal day; multiple questions if days were missed due to absence), at a randomised time within the team's configured delivery window. Question selection SHALL use weighted random selection per Requirement 15.
4. THE Slack_Bot SHALL present each Question with buttons or a select menu for inline Score selection (1 to 5) and an optional Trend_Indicator selection (improving, stable, declining).
5. THE Slack_Bot SHALL include a subtle link to the Web_Interface Session_Link in each message as a fallback for Team_Members who prefer the web experience.
6. WHEN a Team_Member submits their responses via Slack, THE Slack_Bot SHALL validate that every answered Question has a Score between 1 and 5 inclusive and store each valid Response in the same data store as the Web_Interface.
7. IF a Team_Member submits a response via Slack with a Score outside the range 1 to 5, THEN THE Slack_Bot SHALL reject the submission and display a validation error for the affected Question.
8. WHEN a Team_Member completes their submission via Slack, THE Slack_Bot SHALL send a confirmation message to that Team_Member.
9. IF a Health_Check_Session is closed when a Team_Member attempts to respond via Slack, THEN THE Slack_Bot SHALL inform the Team_Member that the session has ended and reject the submission.
10. WHEN a Team_Member has already submitted responses for a session, THE Slack_Bot SHALL allow them to update their responses until the session is closed.
11. THE Slack_Bot SHALL NOT send repeat prompts to weekly-mode Team_Members during the same session; only the session closing reminder (Requirement 13) SHALL serve as a follow-up.
12. IF the Slack_Bot fails to deliver a direct message to a Team_Member due to a Slack API error, THEN THE Slack_Bot SHALL retry delivery up to 3 times with a minimum interval of 5 seconds between attempts and log the failure if all retries are exhausted.
13. THE Slack_Bot SHALL only send messages to Team_Members who have a linked Slack user ID.
14. THE Slack_Bot SHALL allow a Team_Member to initiate a health check response on-demand by sending a slash command (e.g., `/healthcheck`) or direct message to the bot, which SHALL respond with the appropriate prompts based on the Team_Member's cadence preference and outstanding unanswered Questions for the current session.
15. IF a Team_Member triggers an on-demand health check via Slack and no Health_Check_Session is currently open for their Team, THEN THE Slack_Bot SHALL inform the Team_Member that there is no active session and no responses can be submitted.

### Requirement 6: Session Links for Authentication-Free Access

**User Story:** As a team member, I want to access my health check via a simple link without logging in, so that there are no barriers to giving feedback.

#### Acceptance Criteria

1. WHEN a Health_Check_Session is opened, THE Web_Interface SHALL generate a unique Session_Link for each Team_Member belonging to that Team.
2. THE Web_Interface SHALL generate Session_Links that contain a cryptographically random token of at least 32 characters.
3. WHEN a valid Session_Link is accessed, THE Web_Interface SHALL identify the associated Team_Member and Health_Check_Session without requiring additional authentication.
4. IF a Session_Link token is invalid or does not match any record, THEN THE Web_Interface SHALL return an HTTP 404 response with a generic error message that does not reveal whether the token was close to a valid value.
5. IF a Session_Link is accessed after the associated Health_Check_Session has been closed, THEN THE Web_Interface SHALL reject any submission and display a message indicating the session has ended.
6. IF a Session_Link is accessed more than 7 days after the associated Health_Check_Session was closed, THEN THE Web_Interface SHALL treat the link as expired and return an HTTP 404 response with a generic error message. This expiry duration SHALL be configurable at the application level.
7. IF more than 10 failed Session_Link access attempts are made from the same IP address within a 5-minute window, THEN THE Web_Interface SHALL return an HTTP 429 response and reject further attempts from that IP for 15 minutes.

### Requirement 7: Magic Link Access

**User Story:** As a team member, I want to access the web interface at any time — to view trends, manage my preferences, or complete onboarding — without needing an active session or remembering a password.

#### Acceptance Criteria

1. THE Web_Interface SHALL provide a "Request access link" function that sends a Magic_Link to a Team_Member's registered email address.
2. THE Magic_Link SHALL be valid for a maximum of 1 hour from the time of generation and SHALL be single-use (invalidated after first successful access).
3. WHEN a Team_Member accesses a valid Magic_Link, THE Web_Interface SHALL establish an authenticated session lasting a configurable duration (defaulting to 7 days), during which the Team_Member can access all features they are permitted to use (Trend_Dashboard, preferences, Slack identity linking, streak view).
4. IF a Magic_Link is expired or has already been used, THEN THE Web_Interface SHALL return a generic error message and offer to send a new link.
5. THE Web_Interface SHALL rate-limit Magic_Link requests to a maximum of 5 per email address per hour to prevent abuse.
6. THE Magic_Link SHALL be the primary mechanism for accessing the Web_Interface outside of active Health_Check_Sessions, replacing the dependency on Session_Links for non-submission activities.
7. DURING an active Health_Check_Session, Team_Members MAY use either their Session_Link (for quick, direct submission) or a Magic_Link session (for full interface access) — both SHALL be valid simultaneously.
8. THE Web_Interface SHALL allow Team_Members to request a Magic_Link from the login page without requiring any prior authentication, using only their email address.
9. IF a Magic_Link is requested for an email address that is not associated with any existing Team_Member record, THE Web_Interface SHALL present the option to create a new Team upon successful Magic_Link access, simultaneously registering the user and assigning them the delivery_manager role for the new Team.

### Requirement 8: Trend Visualisation Dashboard

**User Story:** As a delivery manager, I want to see how team health scores change over time, so that I can identify patterns, improvements, or areas of concern.

#### Acceptance Criteria

1. WHEN a user navigates to the Trend_Dashboard for a Team, THE Web_Interface SHALL display a line chart showing the average Score (rounded to one decimal place) for each Question across all closed Health_Check_Sessions, with the Y-axis fixed to a range of 1.0 to 5.0 and sessions ordered chronologically on the X-axis.
2. THE Trend_Dashboard SHALL include data from all closed sessions for the Team to render trend lines, requiring a minimum of two closed sessions.
3. IF fewer than two closed sessions exist for a Team, THEN THE Trend_Dashboard SHALL display a message indicating that more data is needed to show trends, in place of the line chart.
4. THE Trend_Dashboard SHALL display the aggregated Trend_Indicator distribution (count of improving, stable, declining) for each Question in the most recent closed session.
5. WHEN a user selects a specific Question on the Trend_Dashboard, THE Web_Interface SHALL display the average Score (rounded to one decimal place) and the count of Responses submitted for that Question in each closed session.
6. IF a Question has zero Responses in a closed Health_Check_Session, THEN THE Trend_Dashboard SHALL omit that session's data point from the line chart for that Question rather than plotting a zero value.
7. IF a Question has fewer than 3 Responses in a closed Health_Check_Session and the Team is in anonymous Privacy_Mode, THEN THE Trend_Dashboard SHALL display "insufficient data" for that question in that session rather than showing the average, to prevent deductive deanonymization. This threshold SHALL be configurable at the application level.
8. THE Trend_Dashboard SHALL always display the response count alongside each session average, so that delivery managers can assess confidence in data based on thin participation.
9. THE Trend_Dashboard SHALL provide an export function that downloads the displayed trend data as a CSV file, with columns for session date, question, average score, response count, and trend indicator distribution.
10. THE CSV export SHALL respect the Team's current Privacy_Mode — in anonymous mode, the export SHALL contain only aggregated data and SHALL NOT include individual Team_Member responses.
11. WHEN a user requests a CSV export, THE Web_Interface SHALL generate the file covering all closed sessions for the Team (or a user-selected date range if specified).

### Requirement 9: Fixed Question Set (MVP)

**User Story:** As a team member, I want a concise, relevant set of questions, so that giving feedback is quick and focused.

#### Acceptance Criteria

1. THE Web_Interface SHALL present the following fixed Questions in every Health_Check_Session, in this exact order: "Delivering Value", "Team Collaboration", "Ease of Delivery", "Learning and Improving", "Psychological Safety".
2. THE Web_Interface SHALL display a description of no more than 150 characters alongside each Question to provide Team_Members with a shared interpretation of what the Question measures.
3. THE Web_Interface SHALL present Questions in the same fixed order specified in criterion 1 for every session and every Team_Member.
4. IF the stored Question set cannot be loaded, THEN THE Web_Interface SHALL display an error message indicating that questions are unavailable and SHALL prevent Response submission until the questions are successfully displayed.

### Requirement 10: Response Data Integrity

**User Story:** As a delivery manager, I want confidence that the collected data is accurate and complete, so that trend analysis is reliable.

#### Acceptance Criteria

1. THE Web_Interface SHALL store each Response with the Score value (1 to 5), optional Trend_Indicator value (improving, stable, or declining), and a reference to the Team_Member, Health_Check_Session, and Question that it relates to.
2. THE Web_Interface SHALL enforce a uniqueness constraint of one Response per Team_Member per Question per Health_Check_Session.
3. WHEN a Team_Member submits a duplicate Response for the same Question in the same session, THE Web_Interface SHALL update the existing Response's Score and Trend_Indicator with the newly submitted values rather than creating a new record.
4. THE Web_Interface SHALL record a UTC timestamp with each Response indicating when it was last submitted or updated, with at least second-level precision.
5. IF a Response submission references a Team_Member, Health_Check_Session, or Question that does not exist, THEN THE Web_Interface SHALL reject the submission and return an error indicating which reference is invalid.

### Requirement 11: Participation Tracking

**User Story:** As a delivery manager, I want to see who has and hasn't responded, so that I can encourage full participation without nagging the whole team.

#### Acceptance Criteria

1. WHILE a Health_Check_Session is open, THE Web_Interface SHALL display the count of Team_Members who have submitted at least one Response and the total Team_Member count for that session.
2. WHILE a Health_Check_Session is open and the Team is in anonymous Privacy_Mode, THE Web_Interface SHALL display the names of Team_Members who have not yet submitted any Response only to the delivery manager (or future authorised roles), and SHALL NOT show this list to other Team_Members.
3. WHILE a Health_Check_Session is open and the Team is in attributed Privacy_Mode, THE Web_Interface SHALL display the names of Team_Members who have not yet submitted any Response to all Team_Members belonging to that Team.
4. THE Web_Interface SHALL NOT reveal individual Team_Member Scores or Trend_Indicator selections to other Team_Members or on the participation view.
5. WHEN a Health_Check_Session is closed, THE Web_Interface SHALL continue to display the final participation count and the names of Team_Members who did not submit any Response during that session, subject to the same privacy mode visibility rules as criteria 2 and 3.
6. THE Web_Interface SHALL restrict the participation view for a Health_Check_Session to users belonging to the same Team (or authorised roles).

### Requirement 12: Team Member Availability and Absence

**User Story:** As a delivery manager, I want to know who is available for each health check session, so that absent team members are not chased for responses and participation metrics are accurate.

#### Acceptance Criteria

1. THE Web_Interface SHALL allow each Team_Member to mark themselves as "away" for a specified date range, during which they will not receive prompts, reminders, or be counted in participation tracking.
2. WHEN a Team_Member is marked as away for the duration of a Health_Check_Session, THE Web_Interface SHALL exclude them from participation counts and SHALL NOT send Slack prompts or closing reminders.
3. BEFORE a scheduled Health_Check_Session opens, THE Web_Interface SHALL send a non-blocking notification to a configurable recipient (defaulting to the delivery manager) listing the Team_Members expected to participate and any who have marked themselves as away.
4. THE configurable recipient for the pre-session notification SHALL be settable to either the delivery manager (via DM) or a team Slack channel, with delivery manager as the default.
5. WHEN the delivery manager receives the pre-session notification, THE Web_Interface SHALL allow them to mark additional Team_Members as away for that session, or override existing away markings to re-include Team_Members (e.g., for cancelled leave or errors), without blocking the session from opening on schedule.
6. IF no adjustments are made in response to the pre-session notification, THE Health_Check_Session SHALL open as scheduled with the current availability settings.
7. THE Web_Interface SHALL allow a Team_Member or delivery manager to remove an "away" marking at any time, immediately re-including the Team_Member in active prompts and participation tracking.

### Requirement 13: Session Reminders and Mid-Week Nudges

**User Story:** As a team member, I want to receive a reminder when the feedback window is about to close and I haven't completed my responses, so that I don't miss the opportunity to contribute.

#### Acceptance Criteria

1. THE Web_Interface SHALL allow each Team_Member to enable or disable session reminders for themselves.
2. WHEN reminders are enabled and a Team_Member has not submitted Responses for all Questions in the current Health_Check_Session and is not marked as away and had sufficient active days to complete all Questions, THE Slack_Bot or Web_Interface SHALL send a closing reminder notification a configurable amount of time before the session closes (defaulting to 24 hours).
3. THE closing reminder SHALL NOT be sent to Team_Members who have already submitted Responses for all Questions in the current session.
4. THE closing reminder SHALL indicate that the feedback window is closing soon and provide a direct link (Session_Link) to submit responses.
5. THE Web_Interface SHALL default new Team_Members to reminders enabled, allowing them to opt out at any time.
6. WHEN a weekly-mode Team_Member did not submit any Response in the previous closed Health_Check_Session and is not marked as away, THE Slack_Bot SHALL send a one-off mid-session nudge (approximately mid-way through the current session) encouraging them to respond, with a direct Session_Link. The nudge SHALL inform the Team_Member when the current session closes and that they will receive a final closing reminder if they still have not responded.
7. THE mid-session nudge SHALL NOT be sent to Team_Members who were marked as away during the previous session.
8. THE mid-session nudge SHALL be sent a maximum of once per session per Team_Member.
9. Reminders and nudges SHALL NOT reveal whether any other specific Team_Member has or has not responded.
10. THE Web_Interface SHALL send a maximum of one closing reminder and one mid-session nudge per session per Team_Member.

### Requirement 14: Response Privacy and Anonymity

**User Story:** As a team member, I want confidence that my individual responses are not attributed to me, so that I can give honest feedback without fear of judgement.

#### Acceptance Criteria

1. THE Web_Interface SHALL operate in one of two privacy modes for each Team: "anonymous" (default) or "attributed".
2. WHILE a Team is in anonymous mode, THE Web_Interface SHALL NOT expose individual Team_Member Scores or Trend_Indicator selections to any other user, including the delivery manager, through any view, API response, or export.
3. WHILE a Team is in anonymous mode, THE Web_Interface SHALL only display aggregated data (averages, distributions, counts) on the Trend_Dashboard and any other shared view.
4. WHEN a Team is switched to attributed mode, THE Web_Interface SHALL require explicit confirmation from the user performing the change and SHALL record a timestamp of when the mode was changed.
5. WHILE a Team is in attributed mode, THE Web_Interface SHALL allow authorised users (per Requirement 19 role definitions) to view individual response trends and sub-group analysis.
6. THE Web_Interface SHALL store Response data linked to the Team_Member internally regardless of privacy mode, to support deduplication, individual trend tracking, and upsert behaviour.
7. THE Web_Interface SHALL display the current privacy mode clearly to Team_Members when they submit responses, so they understand how their data will be used.
8. WHEN a Team transitions from attributed mode back to anonymous mode, THE Web_Interface SHALL immediately cease exposing individual-level data in all views and API responses.

### Requirement 15: Flexible Individual Feedback Cadence

**User Story:** As a team member, I want to choose how frequently I give feedback — all at once or spread across the week — so that it fits my personal rhythm and workload.

#### Acceptance Criteria

1. THE Web_Interface SHALL allow each Team_Member to choose their feedback cadence preference: "weekly" (all questions presented at once) or "micro-pulse" (one question at a time, daily).
2. THE Web_Interface SHALL allow Team_Members to change their cadence preference at any time without losing previously submitted Responses.
3. WHILE a Team_Member's preference is "micro-pulse", THE Web_Interface and Slack_Bot SHALL present Questions using weighted random selection — normally one Question per prompt, but including additional unanswered Questions that accumulated during missed days (absence or unavailability) to enable full coverage within the session window.
4. THE weighted random selection SHALL prefer Questions that the Team_Member has not answered in the current Health_Check_Session, assigning higher selection probability to questions with longer gaps since last response.
5. WHEN a micro-pulse Team_Member has fewer remaining active days in the session than unanswered Questions, THE Slack_Bot SHALL include multiple Questions in a single prompt to give the Team_Member an opportunity to achieve full coverage.
5. WHEN a Team_Member has answered all Questions for the current Health_Check_Session, THE Web_Interface SHALL not prompt further until the next session opens, or SHALL inform the Team_Member that all questions have been covered.
6. WHILE a Team_Member's preference is "weekly", THE Web_Interface and Slack_Bot SHALL present all Questions in a single view or message, consistent with existing Requirement 4 and Requirement 5 behaviour.
7. THE Web_Interface SHALL support mixed cadence preferences within the same Team and Health_Check_Session without affecting data aggregation or trend calculation.

### Requirement 16: Instant Feedback via Rolling Average

**User Story:** As a team member, I want to see how my response compares to the team's recent scores immediately after submitting, so that giving feedback feels rewarding and I understand the team context.

#### Acceptance Criteria

1. WHEN a Team_Member submits a Response, THE Web_Interface SHALL display a rolling average for the answered Question calculated from the most recent N Responses across current and previous sessions (where N is configurable, defaulting to 20).
2. THE Web_Interface SHALL NOT display any average (rolling or otherwise) for a Question until a minimum of 5 Responses have been recorded for that Question across all sessions for the Team.
3. WHEN fewer than 5 Responses exist for a Question, THE Web_Interface SHALL display a message indicating that more responses are needed before averages can be shown.
4. THE rolling average SHALL include Responses from previous closed sessions if the current session has insufficient data to meet the minimum threshold.
5. THE Web_Interface SHALL clearly label the displayed average as a "recent team average" to distinguish it from the true session average shown on the Trend_Dashboard.
6. THE true session average (calculated only from Responses within a single Health_Check_Session) SHALL be stored separately and used for the Trend_Dashboard and future event correlation features.

### Requirement 17: Personal Engagement Streak

**User Story:** As a team member, I want to see my personal feedback streak, so that I feel motivated to maintain the habit of regular participation.

#### Acceptance Criteria

1. THE Web_Interface SHALL track and display a personal streak count for each Team_Member, representing the number of consecutive Health_Check_Sessions in which they submitted at least one Response, regardless of their cadence preference.
2. THE Web_Interface SHALL display the streak only to the individual Team_Member and SHALL NOT expose it to other Team_Members or on any shared view.
3. THE Web_Interface SHALL provide streak protection by allowing one missed session within any rolling 14-day window without breaking the streak.
4. WHEN a Team_Member's streak is broken, THE Web_Interface SHALL display their current streak as reset to zero and their previous best streak for reference.
5. THE streak display SHALL be visually de-emphasised and SHALL NOT block or gate any functionality — it is informational and motivational only.
6. WHEN a Team_Member changes their cadence preference, THE Web_Interface SHALL preserve their current streak count without resetting or converting it.
7. WHEN a Team_Member is marked as away for a Health_Check_Session, that session SHALL NOT count as a missed session for streak calculation purposes.

### Requirement 18: Team Configuration Audit Log

**User Story:** As a delivery manager, I want a record of significant team setting changes, so that I can understand when and why configuration decisions were made.

#### Acceptance Criteria

1. THE Web_Interface SHALL maintain an append-only audit log for each Team, recording significant configuration changes including: privacy mode changes, session schedule changes, team member additions and removals, Slack delivery window changes, and notification recipient changes.
2. Each audit log entry SHALL record the type of change, the previous value, the new value, the identity of the user who made the change, and a UTC timestamp with at least second-level precision.
3. THE audit log SHALL be immutable — entries SHALL NOT be editable or deletable through any user-facing interface or API endpoint.
4. THE Web_Interface SHALL expose the audit log to the delivery manager (or future authorised roles) via the team settings page, ordered chronologically with the most recent entries first.
5. THE API SHALL expose the audit log via a read-only endpoint under the team's resource path.
6. THE audit log SHALL NOT contain individual Response data or Scores — it records only team-level configuration events.

### Requirement 19: Roles and Permissions

**User Story:** As a delivery manager, I want clear boundaries around who can change team settings versus who can only submit responses, so that team configuration is controlled while feedback remains open to all.

#### Acceptance Criteria

1. THE Web_Interface SHALL support two roles per Team: "delivery_manager" (team administrator) and "team_member" (participant).
2. THE delivery_manager role SHALL be permitted to: create and edit the Team, add and remove Team_Members, configure session schedules, change Privacy_Mode, configure Slack delivery windows, configure notification recipients, manually open and close sessions, view the participation tracking view (including non-responder names in anonymous mode), and access the audit log.
3. THE team_member role SHALL be permitted to: submit and update their own Responses, view the Trend_Dashboard (aggregated data only in anonymous mode), set their own cadence preference, mark themselves as away, enable or disable their own reminders, and view their own personal streak.
4. WHEN a Team is created, THE Web_Interface SHALL assign the creating user the delivery_manager role for that Team.
5. THE Web_Interface SHALL allow a delivery_manager to assign the delivery_manager role to other Team_Members, enabling shared administration.
6. THE Web_Interface SHALL allow a delivery_manager to remove the delivery_manager role from another Team_Member, provided at least one delivery_manager remains assigned to the Team.
7. IF removing a delivery_manager role would result in zero delivery_managers for a Team, THEN THE Web_Interface SHALL reject the request and inform the user that at least one delivery_manager must remain.
8. THE Web_Interface SHALL reject any request to perform a delivery_manager-only action from a user who holds only the team_member role, returning an appropriate error message.
9. THE API SHALL enforce the same role-based permissions as the Web_Interface for all endpoints.

### Requirement 20: API Design

**User Story:** As a developer, I want a well-structured API, so that the Slack_Bot and Web_Interface share a consistent backend.

#### Acceptance Criteria

1. THE Web_Interface SHALL expose RESTful API endpoints under the `/api/` path prefix for all operations: team management, session lifecycle, response submission, and trend data retrieval.
2. WHEN an API request contains invalid or missing required fields, THE Web_Interface SHALL return an HTTP 400 response with a JSON body containing a top-level "errors" array where each entry identifies the field name and a human-readable reason for the failure.
3. WHEN an API request references a resource that does not exist, THE Web_Interface SHALL return an HTTP 404 response with a JSON body containing an error message indicating the resource was not found.
4. THE Web_Interface SHALL return all API responses as JSON with the Content-Type header set to `application/json`.
5. IF an unexpected server error occurs during API request processing, THEN THE Web_Interface SHALL return an HTTP 500 response with a JSON body containing a generic error message that does not expose internal implementation details.
6. THE API SHALL enforce the Team's Privacy_Mode on all response-related endpoints — WHILE a Team is in anonymous mode, API responses for trend data and response queries SHALL return only aggregated data and SHALL NOT include individual Team_Member identifiers or their individual Scores.

## Non-Functional Requirements

### NFR 1: Performance

1. THE Web_Interface SHALL respond to form submissions and API requests within 1 second under normal load (defined as up to 50 concurrent users per team).
2. THE Slack_Bot SHALL acknowledge interactive message responses within 3 seconds to avoid Slack's timeout behaviour.
3. THE Trend_Dashboard SHALL render chart data within 2 seconds for teams with up to 52 sessions of historical data (approximately one year of weekly sessions).

### NFR 2: Accessibility

1. THE Web_Interface SHALL conform to WCAG 2.1 Level AA for all user-facing pages, including the feedback form, Trend_Dashboard, and team management views.
2. THE Web_Interface SHALL be operable by keyboard navigation alone, without requiring a mouse or touch input.
3. THE Web_Interface SHALL provide appropriate ARIA labels, roles, and states for all interactive elements, charts, and dynamic content.
4. THE Web_Interface SHALL maintain a minimum colour contrast ratio of 4.5:1 for normal text and 3:1 for large text, consistent with WCAG 2.1 AA requirements.

### NFR 3: Data Integrity and Durability

1. THE Web_Interface SHALL ensure that no Response data is lost due to application restarts or expected operational events (e.g., deployments).
2. THE database SHALL support atomic transactions for response upserts to prevent partial writes.
3. THE Web_Interface SHALL prioritise data durability over availability — in the event of a failure, the system SHALL preserve all previously committed data even if the service is temporarily unavailable.
4. WHEN a Health_Check_Session closes, THE Web_Interface SHALL wait a minimum of 30 seconds after the close timestamp before materialising aggregate snapshots, to ensure all in-flight response submissions that were initiated before close have completed their database transactions.

### NFR 4: Data Retention and Deletion

1. THE Web_Interface SHALL retain all Response data, session history, and trend data indefinitely by default, unless a deletion is explicitly requested.
2. THE Web_Interface SHALL materialise aggregate data (session averages, response counts, trend indicator distributions) at session close as permanent, anonymised snapshots that are no longer linked to individual Team_Members.
3. THE Web_Interface SHALL provide a self-service "Delete my data" function accessible to each Team_Member via their profile settings (reachable via Magic_Link at any time).
4. WHEN a Team_Member initiates data deletion, THE Web_Interface SHALL display a clear explanation of what will be deleted (individual response rows) and what will be preserved (anonymised materialised aggregates), and SHALL require explicit confirmation before proceeding.
5. WHEN deletion is confirmed, THE Web_Interface SHALL immediately remove all individual Response records associated with that Team_Member across all sessions (including any open session), and SHALL record the deletion event in the audit log (without recording the deleted data itself).
6. IF data deletion occurs while a Health_Check_Session is open, THE Web_Interface SHALL remove the Team_Member's active Responses for that session and decrement the live participation count accordingly.
6. THE Web_Interface SHALL NOT modify materialised aggregate snapshots when individual responses are deleted, as these constitute anonymised statistical data from which no individual can be re-identified.
7. THE Web_Interface SHALL inform the Team_Member at the point of deletion that historical aggregate data will be retained as it is anonymised and cannot be attributed to them.
