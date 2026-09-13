# Design Document

## Overview

Slack proves who someone is. A single-use link carries that proof to the
browser. The browser session that results is the one the application already
understands.

That last point is what keeps this small: `verifyMagicLink` already claims a
one-time token and creates a `UserSession`. Slack sign-in is the same mechanism
with a different delivery channel and a different proof of identity — not a
second authentication system.

## Key Decisions

### 1. Slack hands back a link, because Slack cannot set a cookie

A slash command reply is a JSON response to Slack's servers, which render it in
the client. There is no browser in that loop and no `Set-Cookie` to send.

So the flow is: verified Slack request → resolve member → mint a single-use
token → reply with an ephemeral link → member clicks → the existing verification
route establishes the session.

This is a magic link delivered over Slack. Treating it as such means reusing the
token lifecycle, the expiry, the single-use claim and the session creation
rather than writing a parallel set with its own bugs.

### 2. Two ways to bind an identity, specified separately

The chicken-and-egg is real: pairing needs a session, and a session needs email.
Breaking it requires someone other than the member to vouch, or Slack to vouch.

**Manager-asserted** (Requirement 2) needs no new Slack scope and unblocks a
trial immediately. Its weakness is honest: the manager could bind their own
Slack account to a colleague's member row and then sign in as them. What stops
that being equivalent to holding a credential is that it is **visible** — the
binding is audited, attributable, and changeable only by a Delivery Manager.
A quiet capability is worse than a declared one.

**Slack-asserted** (Requirement 3) is self-service and removes email from the
critical path for good. It costs the `users:read.email` scope — which this
project removed once already, on the grounds that nothing called `users.info`
and speculative permissions should not be granted. Now something would call it,
which is exactly the condition under which granting it is right.

Specified separately so the scope decision can be made on its own, and so
Requirement 2 can ship without waiting for it.

### 3. Workspace membership grants nothing

Anyone in a Slack workspace can run a slash command. The temptation is to treat
that as membership — it is not. A contractor invited to one channel is in the
workspace.

So: the application never creates a `TeamMember` in response to a Slack
interaction, and signs in only Slack users who resolve to a member that already
exists. Slack answers *who is this*, never *should they have access*.

### 4. The ambiguity guard applies unchanged

`requestMagicLink` refuses to issue anything when an email matches members in
more than one team, because `findByEmail` returns an arbitrary row and would
sign someone into whichever team the query happened to return.

Email matching from Slack has exactly the same failure mode, so it uses
`findAllByEmail` and refuses on more than one, rather than reimplementing a
looser rule.

### 5. Anti-enumeration is cheaper here, but not free

`requestMagicLink` returns void for every input so nobody can probe which
addresses exist. A slash command reply goes only to the person who ran it, which
narrows the exposure considerably — but a workspace member could still learn
whether a colleague's email is registered.

So the unlinked reply says what to do without confirming or denying that any
particular person exists in any team.

### 6. Failure has to be legible

The defect that motivated this spec was a *silent* one: mail dropped with no
bounce, no log, and a UI that says "check your email" either way. Rebuilding
that pattern in Slack would be a poor lesson to have learned.

Every refusal in this flow therefore says what happened and what to do next.
Ephemeral replies make that safe — there is no audience to leak to.

## Correctness Properties

1. **No Slack interaction creates a team member.** For any sequence of Slack
   requests, the set of `TeamMember` rows is unchanged.
2. **A sign-in link is single-use.** The second claim of a token fails, as with
   magic links.
3. **Binding is injective.** One Slack user id resolves to at most one member.
4. **Ambiguity refuses.** An email matching members in more than one team issues
   nothing, by either route.
5. **Identity comes only from a verified payload.** No Slack user id is read
   from an unverified request body.
6. **Removal revokes.** A member removed from a team cannot sign in through a
   surviving identity link.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Member resolution, ambiguity, injective binding | Unit, in-memory fakes | Pure service rules |
| Signature rejection | Route | Only the handler composes verification with identity |
| Link is single-use and expires | Integration, real file | Token claim is a compare-and-set against the database |
| Manager binding UI, audit, and its warning copy | UI + route | Copy is part of the control — a manager must know what they are asserting |
| A Slack sign-in actually produces a usable browser session | E2E | Nothing below the browser proves a cookie was set and works |
| Slack genuinely sends what we think | Manual, real workspace | The same reason Task 24.5 existed: only a workspace proves Slack's side |

The last row is not optional. The 2026-08-26 workspace pass found three defects
a 1,150-test suite could not see, each visible only outside the app.

## Out Of Scope

- **OAuth sign-in with Slack** (the full "Sign in with Slack" identity product).
  Heavier, and unnecessary when the app already verifies signed requests.
- **Slack as the only route.** Email stays. Requirement 5 is about removing a
  single point of failure, not swapping which one it is.
- **Multi-workspace support.** One workspace, matching the one-team constraint.
- **Answering a health check entirely inside Slack.** Already possible through
  interactive blocks; unchanged here.
- **Deleting the pairing-code flow.** It still serves someone already signed in
  who wants to link Slack. Revisit once Requirement 3 has been in use.
