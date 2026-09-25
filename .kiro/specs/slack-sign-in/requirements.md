# Requirements Document

## Introduction

Today there is exactly one way into this application: a magic link sent by
email. That single dependency turned out to be load-bearing in a way nobody had
noticed until provisioning began.

Sending mail as a domain requires DNS records proving you own it. Without a
verified domain, Resend's sandbox sender delivers **only to the account owner**
and drops every other recipient silently. And because `requestMagicLink` returns
void for every input — deliberately, so nobody can probe which addresses exist —
a colleague who cannot receive mail sees "check your email" and waits forever,
with nothing in any log to say why.

So the tool cannot currently be trialled with a team unless its owner also owns
a domain. That is an odd thing for a team feedback tool to require.

Slack is already integrated, already trusted, and already where these
conversations happen. A `/healthcheck` request arrives with a verified Slack
signature, which is proof of identity at least as strong as possession of an
inbox. This spec makes that proof usable for signing in.

**Slack cannot set a browser cookie.** Whatever we build, Slack proves who
someone is and then has to hand the browser something. That shape — identity
established in one channel, carried to the browser by a single-use link — is the
same shape the magic link already has. Most of the machinery exists.

## Glossary

- **Workspace member**: anyone in the Slack workspace. Not the same as a team
  member, and the distinction is the whole security question here.
- **Team member**: a `TeamMember` row. Only these may sign in.
- **Identity link**: a `SlackIdentityLink` row binding a Slack user id to a team
  member. Exists today, created by the pairing-code flow.
- **Binding**: the act of establishing an identity link. The question of *who is
  allowed to assert one* is the heart of this spec.
- **Sign-in link**: a single-use, short-lived URL that establishes a browser
  session. What Slack hands back.

## The chicken-and-egg this has to break

The pairing flow already links Slack accounts — but `POST /api/me/slack-link`
derives the member from the session cookie, so **you must already be signed in
to link your Slack account**. Since signing in requires email, Slack linking
requires email, and Slack sign-in for a first-time user is impossible today.

There are two ways out, and they differ in what they cost:

- **Delivery manager asserts the binding.** They record which Slack user is
  which member. No new Slack scope, no email. The binding is only as good as the
  manager's care, but authentication is still the member's own Slack account —
  the manager never holds a credential and cannot sign in as anyone.
- **Slack asserts the binding.** The app reads the Slack user's verified email
  and matches it to a member. Fully self-service, and removes email from the
  critical path permanently — but requires the `users:read.email` scope, which
  this project deliberately removed once already as speculative.

Both are specified. The first is smaller and unblocks a trial; the second is the
better end state.

## Requirements

### Requirement 1: Signing In From Slack

**User Story:** As a team member, I want to sign in from Slack, so that I can answer a health check without waiting for an email that may never arrive.

#### Acceptance Criteria

1. WHEN a workspace member whose Slack account is linked to a team member runs the sign-in command, THE application SHALL reply with a single-use sign-in link.
2. WHEN that link is opened, THE application SHALL establish the same browser session a magic link would, with the same expiry.
3. THE reply SHALL be ephemeral — visible only to the person who ran the command, never posted to a channel.
4. THE sign-in link SHALL be single-use and SHALL expire quickly, on the same terms as a magic link.
5. WHERE the Slack account is not linked to any team member, THE reply SHALL say so and explain what to do, without revealing whether that person exists in any team.
6. THE request SHALL be rejected unless its Slack signature verifies, since that signature is the entire basis of the identity claim.

### Requirement 2: A Binding The Manager Asserts

**User Story:** As a delivery manager, I want to record which Slack account belongs to which member, so that my team can sign in without email being configured.

#### Acceptance Criteria

1. THE team settings page SHALL let a Delivery Manager record a Slack user id against a member.
2. THE application SHALL reject a Slack user id already bound to a different member, since one Slack account cannot be two people.
3. WHEN a binding is created, changed, or removed, THE application SHALL write an audit entry naming the actor, because asserting someone else's identity is exactly the kind of act a log exists for.
4. THE Delivery Manager SHALL NOT gain the ability to sign in as that member: the binding asserts *who* a Slack account belongs to, while authentication remains that person's own Slack login.
5. THE settings page SHALL say plainly what a binding does and does not grant, so the manager is not guessing at its weight.

### Requirement 3: A Binding Slack Asserts

**User Story:** As a team member, I want signing in from Slack to just work, so that nobody has to set me up first.

*Requires the `users:read.email` scope. Deliberately separable from Requirement 2, because a new scope is a decision with its own review.*

#### Acceptance Criteria

1. WHERE the Slack account is unlinked, THE application SHALL read the Slack user's email and match it to a team member.
2. THE match SHALL be exact and case-insensitive, and SHALL create the identity link automatically on success.
3. WHERE the email matches members in more than one team, THE application SHALL refuse and issue nothing, matching the existing ambiguous-identity guard rather than choosing arbitrarily.
4. WHERE the email matches no member, THE application SHALL NOT create a team member, since workspace membership is not team membership.
5. WHERE the email is unavailable — a guest account, or a missing scope — THE application SHALL fall back to the manager-asserted path rather than failing opaquely.
6. THE automatically created link SHALL be audited, distinguishable from one a manager asserted.

### Requirement 4: Slack Membership Is Not Team Membership

**User Story:** As a delivery manager, I want confidence that being in our Slack workspace does not grant access to our health checks, so that inviting a contractor to a channel is not also inviting them to our feedback.

#### Acceptance Criteria

1. THE application SHALL NOT create a team member in response to any Slack interaction.
2. THE application SHALL sign in only workspace members who resolve to an existing team member.
3. THE sign-in command SHALL be rate limited per Slack user, on the same reasoning as the magic-link limit.
4. WHERE a member is removed from a team, THEIR identity link SHALL stop granting access.

### Requirement 5: Email Stops Being The Only Way In

**User Story:** As the maintainer, I want a second route into the application, so that one unverified DNS record cannot make the tool unusable for a team.

#### Acceptance Criteria

1. THE application SHALL remain fully usable when no email provider is configured, provided Slack is.
2. THE application SHALL remain fully usable when no Slack app is configured, provided email is.
3. WHERE neither is configured, THE application SHALL say so at startup rather than presenting a sign-in page that cannot work.
4. THE documentation SHALL state which routes in exist, and what each requires.

## Non-Functional Requirements

### NFR 1: The Signature Is The Root Of Trust

1. Every identity claim in this spec rests on Slack's request signature. It SHALL be verified before any identity work.
2. A Slack user id SHALL never be accepted from a request body, only from a verified payload — the same rule that governs `AuthContext.memberId`.
3. WHERE the signing secret is absent or blank, verification SHALL reject every request rather than deriving a signature from an empty key. An empty key is not a weak secret but a published one: anybody can compute the same HMAC, so a forged request verifies and the signature stops being evidence of anything. Requirement 5.2 permits a deployment with no Slack app configured — it does not permit one whose Slack routes accept unauthenticated traffic.
4. WHERE a deployment configures Slack at all, startup SHALL require the signing secret alongside the bot token. A process that can post to Slack but cannot check what comes back is exactly the configuration criterion 3 rejects, and it SHALL be refused before it serves a request rather than at the first forged one.

*Added 2026-09-25, after an external review found that `verifySlackSignature` read the secret as `process.env.SLACK_SIGNING_SECRET ?? ''` and that no startup guard required it. Criteria 1 and 2 were both kept to the letter: the signature was verified before identity work, and the Slack user id came from a verified payload. Neither said what "verified" means when the key is empty, and an empty key verifies anything. The gap was in the requirement before it was in the code.*

### NFR 2: Auditability

1. Every binding SHALL be attributable: who asserted it, when, and whether a human or an email match.
2. A sign-in SHALL be distinguishable in the audit log by the route it came in through.

### NFR 3: No New Standing Credential

1. No part of this SHALL produce a credential a delivery manager holds on a member's behalf. That was the explicit reason for choosing this design over surfacing session links.
