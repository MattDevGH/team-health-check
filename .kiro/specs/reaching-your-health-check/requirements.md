# Requirements Document

## Introduction

On 2026-09-14 the production scheduler opened a health check exactly on
schedule, generated a session link, and told nobody. The delivery manager,
signed in and looking at the dashboard, had no way to answer it.

Both halves of that are real.

**Nothing in the authenticated interface links to a session.** The dashboard's
lifecycle panel reports "0 of 1 answered" and offers a button to *close* the
check, but no route to *answer* it. `/session/[token]` exists and works; nothing
points at it. The end-to-end suite reaches it by reading the token out of the
database — the same "navigating by URLs it looked up" pattern that hid the
sign-in dead end for a fortnight.

**Email cannot deliver a prompt.** `EmailService` has exactly one method,
`sendMagicLink`. The scheduler tick calls `sendSlackPrompt` and nothing else, so
a team without Slack is never told a check has opened. Email is the only way
*in* to the application and Slack is the only way to hear that there is
something to do — each a single point of failure, in opposite directions.

Slack is intended to stay the primary route. This spec does not change that. It
removes the assumption that it is the *only* route, and gives a member a way to
find their own check when no message reaches them.

## Glossary

- **Session_Link**: the per-member, per-session token at `/session/[token]`.
  Generated when a check opens. A credential: it authenticates its holder.
- **Prompt**: the message telling a member a check has opened.
- **Channel**: Slack or email. How a prompt is delivered.
- **Collecting**: a check that is open and accepting responses.

## Requirements

### Requirement 1: A Member Can Reach Their Own Check

**User Story:** As a team member, I want to open the current health check from the application, so that I can answer it without waiting for a message or keeping a link.

#### Acceptance Criteria

1. WHERE a check is collecting and the signed-in member has a session link for it, THE dashboard SHALL offer a route to answer it.
2. THERE SHALL be a route that resolves the signed-in member's current check wherever they are in the application, reachable from the navigation shell.
3. WHERE no check is collecting, THAT route SHALL say so rather than erroring.
4. WHERE the member has already answered every question, THE route SHALL still let them review and change their answers, since responses are editable until close.
5. THE route SHALL be available to every member, not only a Delivery Manager. A contributor's journey never touches the dashboard today.
6. THE member's own session link SHALL be resolved from their authenticated identity, never supplied by the caller.

### Requirement 2: A Member Cannot Reach Anyone Else's

**User Story:** As a team member, I want confidence that nobody else can answer as me, so that the feedback attributed to me is mine.

*A session link is a credential. Surfacing links was rejected during the Slack sign-in spec precisely because a manager holding one could submit as that member.*

#### Acceptance Criteria

1. THE route SHALL resolve only the authenticated member's own session link.
2. THE application SHALL NOT display another member's session link to anyone, including a Delivery Manager.
3. WHERE a member has no session link for the open check, THE route SHALL say so rather than falling back to any other member's.

### Requirement 3: Email Can Deliver A Prompt

**User Story:** As a team member whose team does not use Slack, I want to be told when a health check opens, so that the tool works for us at all.

#### Acceptance Criteria

1. `EmailService` SHALL be able to send a health check prompt carrying the member's session link.
2. WHEN a check opens, THE application SHALL deliver a prompt by every channel the member is eligible for.
3. THE email prompt SHALL be distinguishable from a magic link, since one signs you in and the other asks for your answers.
4. WHERE email delivery fails, THE failure SHALL be visible to the maintainer and SHALL NOT prevent Slack delivery, or vice versa.
5. THE existing availability and delivery-window gates SHALL apply to email as they do to Slack, so an away member is not prompted by a new channel.

### Requirement 4: A Member Chooses Their Channels

**User Story:** As a team member who lives in Slack, I want to turn email prompts off, so that the tool does not spam me with a second copy of something I have already seen.

*Slack is the intended primary route. A member who gets both is being told twice.*

#### Acceptance Criteria

1. THE profile page SHALL let a member turn email prompts on or off.
2. THE preference SHALL govern prompts only, and SHALL NOT affect magic links — a member who turns email off must still be able to sign in.
3. THE default SHALL be chosen so that a member who configures nothing still hears about their check.
4. THE preference SHALL be distinct from `remindersEnabled`, which governs *which* notifications are sent rather than *how* they arrive.
5. THE control SHALL explain what it affects, since "email notifications" alone does not say whether sign-in is included.

### Requirement 5: Slack Stays The Primary Route

**User Story:** As a delivery manager, I want Slack to remain where my team answers health checks, so that this work does not quietly change how the tool is used.

#### Acceptance Criteria

1. Slack prompt behaviour SHALL be unchanged by this work.
2. WHERE a member has Slack linked, THE default channel behaviour SHALL favour Slack.
3. THE documentation SHALL state which channels exist, what each requires, and what happens when only one is configured.

## Non-Functional Requirements

### NFR 1: No New Credential Exposure

1. No part of this SHALL display a session link belonging to another member.
2. A session link SHALL NOT appear in a log, an error message, or any page a different member can load.

### NFR 2: Delivery Is Observable

1. A prompt that fails to send SHALL be visible to the maintainer rather than silent, matching the standard the magic-link path failed to meet.
2. Delivery SHALL remain idempotent: a member SHALL NOT be prompted twice for the same check on the same channel.

### NFR 3: Accessibility

1. Every new control and route SHALL meet the standing bar: axe against WCAG 2.1 AA, asserted semantics, and keyboard operation driven end to end.
