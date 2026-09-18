# Design Document

## Overview

Two routes to the same session link: one the member navigates to, one that is
sent to them. Neither is new machinery — the link already exists per member per
session, and the notification service already decides who is eligible. What is
missing is a page that resolves your own link, and a second channel that can
carry it.

## Key Decisions

### 1. The link is resolved from the session cookie, never passed around

A session link authenticates whoever holds it. That is why surfacing links for a
manager to hand out was rejected in the Slack sign-in spec: a manager holding a
member's link can submit as them, and for a tool built on candid feedback that
is close to fatal.

So the new route takes no identifier. It reads `AuthContext.memberId`, finds the
team's collecting session, and looks up that member's link. A caller cannot ask
for anyone else's, because there is no parameter in which to ask.

### 2. Both a dashboard link and a route of its own

The dashboard's lifecycle panel already knows a check is collecting — it renders
"0 of 1 answered" beside a close button. A link there is the shortest path from
what exists, and lands where a manager is already looking.

It is not sufficient on its own. **A contributor's journey never touches the
dashboard**: they arrive from a prompt, answer, and leave. A member who loses
the message has nowhere to go. So there is also a route in the navigation shell,
which works as a bookmark and does not depend on knowing which team you are in.

Agreed 2026-09-14. Both, rather than either.

### 3. Email prompts exist, and default to off for members with Slack

Slack stays primary (Requirement 5). Email exists so a team without Slack is not
silently unreachable, and so a lost Slack message is not the end of it.

The default is the interesting part. A member with Slack linked who also gets an
email is being told twice about the same thing, which is how notification
settings get switched off wholesale. So:

- **No Slack link → email prompts on.** Otherwise they hear nothing at all,
  which is the failure this spec exists to fix.
- **Slack linked → email prompts off.** Slack has it covered.
- **An explicit preference overrides either default**, in both directions: a
  Slack user who wants a paper trail can have one, and someone who prefers Slack
  silence can turn email on while unlinked.

The alternative — always on, opt out — was considered. It is simpler to explain
and one fewer branch, but it means every existing Slack user starts receiving
mail they did not ask for the day this ships. A default that depends on whether
another channel is already working is worth the extra condition.

**The stated cost:** if Slack delivery breaks for a linked member, they hear
nothing, because email defaulted off. That is a real hole and the reason NFR 2
asks for failures to be visible. Prompting by both channels on Slack failure is
not attempted here — a delivery-failure fallback needs the queue to report
outcomes, and that is its own piece of work.

### 4. The preference is about channel, not about content

`remindersEnabled` already exists and governs *which* notifications a member
gets — closing reminders and mid-session nudges, deliberately not opening
prompts (Original 13.1). The new preference governs *how* a notification
arrives.

They are orthogonal, and collapsing them would mean turning off email also
turned off Slack reminders. Two fields, and the profile page has to make the
difference legible — a control labelled only "email notifications" leaves a
member guessing whether sign-in links are included. They are not, and it must
say so (Requirement 4.2, 4.5).

### 5. A prompt email is not a magic link

They arrive from the same sender and both contain a link, and one signs you in
while the other asks for your answers. A member who confuses them will click the
wrong one and wonder why nothing happened.

So the prompt states what it is, what it is for, and when the check closes.
`EmailService` gains a second method rather than a `type` parameter on the
first, so the two cannot drift into sharing a template by accident.

### 6. Channels are independent

A Slack failure must not stop an email, or the reverse (Requirement 3.4). Each
channel is attempted on its own and failure is reported rather than thrown, the
way `sendSlackPrompt` already returns a boolean.

The existing eligibility gates — Slack link, availability, delivery window — are
about *whether this member should be disturbed now*, not about Slack. Availability
applies to both channels; the delivery window is a Slack-specific configuration
and stays Slack-specific.

## Correctness Properties

1. **A member can only ever reach their own link.** For any authenticated member
   and any session, the resolved link belongs to that member.
2. **No page renders another member's session link**, for any viewer including a
   Delivery Manager.
3. **Prompt delivery is idempotent per channel.** A member is prompted at most
   once per check per channel, enforced by the existing
   `NotificationDelivery` claim.
4. **Channel independence.** For any member, the outcome on one channel does not
   change the outcome on the other.
5. **Sign-in survives every preference.** No combination of notification
   preferences prevents a magic link being sent.
6. **An explicit preference wins.** Where a member has chosen, that choice
   decides whether email is used, whatever else is true of their setup. Added
   2026-09-18 while building 3.1: the design stated a default and never stated
   that a choice overrode it, and an implementation consulting the Slack link
   first would satisfy every example where the two happen to agree.
7. **Nobody is unreachable by default.** A member who has chosen nothing always
   has at least one prompt channel. Silence is only ever something somebody
   asked for.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Own-link resolution, and refusal to resolve another's | Unit, in-memory fakes | Pure service rules over repositories |
| The route reads identity from the cookie | Route | Only the handler composes auth with resolution |
| Default channel by Slack-link presence | Unit | A decision table, best exercised directly |
| Preference persists and survives reload | UI + route | The `privacyMode` defect was exactly this: a field the page read and the API never sent |
| Email prompt renders a usable link | Unit over the payload | Assert the message, not that a sender was called — the reminder that rendered identically to a prompt passed that way |
| A member can actually answer from the dashboard | E2E | Nothing below the browser proves a link reaches a working page |
| axe on both new surfaces | E2E | jsdom cannot evaluate colour |

The fifth row is the one this project keeps relearning. Asserting that
`emailService.sendPrompt` was called proves the wiring and not the message.

## Out Of Scope

- **Falling back to email when Slack delivery fails.** Needs the retry queue to
  report outcomes; its own work.
- **Digests or batching.** One prompt per check.
- **Per-team channel policy.** The preference is the member's.
- **Changing Slack prompt behaviour**, which Requirement 5.1 explicitly
  protects.
- **Slack sign-in**, specced separately in `.kiro/specs/slack-sign-in/`.
