# Implementation Plan

Phase 1 delivers a working Slack sign-in for anyone already linked. Phase 2 lets
a Delivery Manager create those links, which is what unblocks a trial with no
email. Phase 3 makes it self-service and costs a Slack scope.

Phases 1 and 2 together are sufficient to run a team trial without a verified
sending domain. Phase 3 is the better end state and can wait for its own
decision.

---

## Phase 1 — Slack hands back a working sign-in link

### 1.1 A linked Slack user can request a sign-in link

- [x] Failing test: a verified command from a Slack user with an identity link
      returns an ephemeral reply containing a sign-in URL
- [x] Failing test: the reply is `response_type: ephemeral` — a sign-in link
      posted to a channel is a credential in a channel
- [x] Failing test: an unlinked Slack user gets guidance, and the reply reveals
      nothing about whether that person exists in any team
- [x] Failing test: an unverified signature is rejected before any identity work
- [x] Implement, reusing the magic-link token lifecycle rather than minting a
      parallel one
- [x] Two of those tests passed before any of this existed: `signin` fell
      through to the default handler, whose unlinked reply also mentions
      `connect` and is also ephemeral. They assert wording and a link only
      this branch produces
- _Requirements: 1.1, 1.3, 1.5, 1.6, NFR 1.1, NFR 1.2_
- _Property: 5_

### 1.2 The link establishes a session, once

- [x] Failing test: opening the link establishes a `UserSession` with the same
      expiry a magic link produces — compared against an actual email-issued
      token rather than a constant copied out of the implementation
- [x] Failing test: the second use of the same token fails
- [x] Failing test: an expired token fails
- [x] Integration test over a real file: the claim is a compare-and-set, so two
      concurrent uses cannot both succeed. **`atomic-claims.test.ts` had said
      in its own header that these were owed to "Task 18.x" and they had never
      been written** — single-use had only ever been proved against a
      JavaScript `Map`, where the single thread makes a claim atomic for free
- [x] Mutation check: removing the `used: false` filter fails two integration
      tests and **not** the in-memory unit test
- _Requirements: 1.2, 1.4_
- _Property: 2_

### 1.3 Rate limit the command

- [x] Failing test: repeated requests from one Slack user are refused after a
      threshold, on the same reasoning as the magic-link limit
- [x] Failing test: an unlinked Slack account is counted too, so the limit
      cannot be used to read team membership off which ids start being refused
- [x] Failing test: the refusal is legible — it says when to try again.
      `retryAfterMs` reports when the oldest attempt leaves the window, with
      its own tests under a controlled clock: a service-level assertion of
      "some positive number under an hour" passed against an implementation
      that always returned the full window
- _Requirements: 4.3_

**Checkpoint:** anyone already linked can sign in from Slack. Nobody can link
without email yet, which phase 2 fixes. One PR.

---

## Phase 2 — A Delivery Manager can assert a binding

### 2.1 Record a Slack user id against a member

- [x] Failing test: a Delivery Manager can set a member's Slack user id
- [x] Failing test: a Slack user id already bound to another member is
      rejected, **and the existing binding survives the refusal** — the throw
      is the symptom, the survival is the guarantee
- [x] Failing test: an ordinary member cannot bind anyone, including
      themselves. Self-service assertion is what phase 3 pays for with a
      verified email, not something to get for free here
- [x] Failing test: a manager of another team cannot bind either
- [x] Failing test: clearing a binding removes the link, and that Slack account
      stops resolving to anybody
- [x] Failing test: a value that could not be a Slack id is refused at the edge
- [x] Mutation check: injectivity 2, unchanged-value 1, team membership 1,
      authorisation 2
- _Requirements: 2.1, 2.2_
- _Property: 3_

### 2.2 Audit every binding

- [x] Failing test: creating, changing and removing a binding each write an
      audit entry naming the actor
- [x] Failing test: nothing is written when nothing changed, or when a binding
      was refused — a log of non-events is a log nobody reads
- [x] The change types are `slack_binding_asserted` and
      `slack_binding_removed`, named for *how* the binding came about so that
      phase 3's email-matched link is distinguishable
- [x] The audit log page labels both rather than falling back to a raw string
- [x] One test of mine was flaky by construction — it asserted on
      `entries()[0]`, and two entries written in the same millisecond sort
      unpredictably. It finds the entry by change type now
- _Requirements: 2.3, NFR 2.1, NFR 2.2_

### 2.3 Say what a binding grants

- [x] Failing test: the settings UI states that binding asserts identity and
      does not grant the manager the ability to sign in as that member
- [x] **The page said the opposite and had to be corrected**: "Only they can do
      this; it is not something you can set on their behalf" was true until
      this feature existed, and would have left the page contradicting the
      control beneath it. A test asserts that sentence is gone
- [x] Failing test: the row reports the link from the server's answer rather
      than from the click — `MembersSection` is controlled, so the observable
      outcome is what it hands its parent
- [x] axe against the new control, including its explanatory copy
- [x] Keyboard operable end to end
- _Requirements: 2.4, 2.5, NFR 3.1_

**Checkpoint:** a team can be set up and can sign in with no email configured at
all. This is the point at which a trial becomes possible without a domain. One
PR.

---

## Phase 3 — Slack asserts the binding

Needs the `users:read.email` scope. This project removed `users:read` once for
being speculative; it stops being speculative here, but the decision is its own.

### 3.1 Match an unlinked Slack user by verified email

- [x] Failing test: an unlinked Slack user whose email matches one member is
      linked automatically and signed in
- [x] Failing test: an email matching members in more than one team issues
      nothing, matching the existing ambiguous-identity guard, and creates no
      link either — the ambiguity must not be resolved by accident
- [x] Failing test: an email matching no member creates no team member and says
      exactly what an unlinked account is told
- [x] Failing test: matching is case-insensitive and exact — no prefix or domain
      matching. `alice@example.invalid.attacker.test` matches nothing
- [x] Mutation check: dropping the ambiguity guard fails 2, creating a member
      when none matches fails 4
- _Requirements: 3.1, 3.2, 3.3, 3.4_
- _Properties: 1, 4_

### 3.2 Degrade rather than fail opaquely

- [x] Failing test: a Slack user with no readable email falls back to the
      manager-asserted path with a legible message
- [x] Failing test: a missing scope produces the same fallback, not a 500 —
      and so do an HTTP error and a network failure. A slash command has three
      seconds to answer; an exception escaping would turn a Slack outage into
      an error for somebody who only wanted to sign in
- [x] Failing test: with no directory configured at all, the manager-asserted
      path still signs people in — the fallback must not disable what it falls
      back to
- [x] The refusal is recorded as `slack.email.unavailable` carrying Slack's own
      error, so `missing_scope` is visible rather than inferred from members
      who cannot sign in. No address appears in the record
- [x] The scopes are documented in the README table alongside the existing
      three, with what calls them and why `users:read` was removed once
- _Requirements: 3.5, 5.4_

### 3.3 Audit the automatic link

- [x] Failing test: an email-matched binding is audited and distinguishable from
      a manager-asserted one — `slack_binding_matched` against
      `slack_binding_asserted`, because who linked an account and on what basis
      are different questions
- [x] Failing test: the entry carries ids and not the address the match was
      made on
- _Requirements: 3.6_

---

## Phase 4 — Both routes, and neither

### 4.1 Removal revokes access

- [x] Failing test: a member removed from a team cannot sign in through a
      surviving identity link
- [x] Failing test: the identity link does not outlive the member row in a way
      that would resurrect access if the member were re-added
- [x] Failing test: a sign-in link minted before they left stops working, and a
      browser session already open is revoked
- [x] Failing test: everybody else can still sign in — a removal that revoked
      too broadly would be its own outage
- [x] **The fakes disagreed with the database.** Prisma deletes the identity
      link, sessions and magic links inside its removal transaction; the
      in-memory repositories removed the member and left them all. The property
      could not be proved against fakes, and a route test would have passed
      against a fake *less safe than production*. The fakes mirror the
      transaction now, and the guarantee is asserted in both tiers
- [x] Mutation check: the Prisma delete fails 1 test, the fake delete fails 3
- _Requirements: 4.4_
- _Property: 6_

### 4.2 Either provider is sufficient, neither is fatal silence

- [x] Failing test: with no email provider configured but Slack present, the
      application is fully usable
- [x] Failing test: with no Slack app configured but email present, unchanged
- [x] Failing test: with neither configured, startup says so rather than
      presenting a sign-in page that cannot work — naming both variables, and
      the consequence rather than just the variable
- [x] Failing test: an empty string counts as absent, which is the shape a
      misconfigured deployment actually takes
- [x] The guard runs **after** the TEST_MODE check, so the graver fault is
      reported first. Three existing tests had to gain a provider: a production
      environment with only a database URL is no longer sufficient to start
- _Requirements: 5.1, 5.2, 5.3_

### 4.3 Document the ways in

- [x] README and `docs/deployment.md`: which routes in exist, what each requires,
      and what happens when only one is configured
- [x] State plainly that without a verified sending domain, email delivers only
      to the Resend account owner — the defect that motivated this spec, and
      that a Slack deployment can skip that section entirely
- _Requirements: 5.4_

---

## Phase 5 — Prove it in a real workspace

### 5.1 Workspace acceptance

Not optional, and not replaceable by tests. The 2026-08-26 pass found three
defects a 1,150-test suite could not see, each visible only outside the app.

Run against Matt's sandbox workspace on 2026-09-17, against the hosted app
rather than an ngrok tunnel.

- [x] A linked member signs in from Slack and reaches their dashboard
- [x] The sign-in link is ephemeral — Slack marked it "only visible to you"
- [x] A second use of the same link fails: "Invalid or expired access link",
      with a route to request a new one. **The single-use claim, proven in
      production** — until this run it had been proved against a JavaScript
      `Map` and a temporary SQLite file, never against Turso through Slack
- [x] `/healthcheck connect` still issues a ten-minute pairing code, so the
      manual path is intact alongside the automatic one
- [x] **With phase 3: an unlinked account is matched and signed in with no
      setup at all.** Unlinked deliberately, then `signin` returned a working
      link and the profile showed Slack linked again — which exercises the two
      `users:read` scopes, the `users.info` call, the exact-email match, the
      automatic link and the sign-in in one pass
- [ ] An unlinked user gets guidance rather than an error. **Not reachable in a
      one-person workspace**: every Slack account there matches a member, so
      the automatic path always succeeds. Needs a second address
- [ ] Confirm what Slack actually returns for a guest account, rather than
      assuming the fallback path is reachable. Same blocker
- [x] **Found by this pass, and by nothing else — a hole in the audit log.**
      Matt read his own log and saw two `slack_binding_matched` entries, each
      with "Slack user id: None" beforehand, and nothing between them saying
      how the account came to be unlinked. Unlinking from the profile page
      deleted straight from the repository and wrote nothing; so did linking
      with a pairing code. Three of the four ways a binding changes were
      audited and the two a member does for themselves were not, which is NFR
      2.1 half-kept. Both are audited now —
      `slack_binding_self_linked` for the pairing code, and the existing
      `slack_binding_removed` for the unlink, since it is the same event and
      `userId` is what says who did it
- [x] **Found by this pass, and by nothing else:** `slack_binding_matched` had
      no label, so an automatic link rendered in the audit log as "Slack
      binding matched". Phase 2 labelled its two change types and phase 3 added
      a third without one. Fixed, with two tests — one of which passed against
      the defect until its regex was found to contain literal backspace
      characters where `\b` was intended
- _Requirements: 1.1, 1.2, 1.4, 3.1, 3.5_

### 5.2 Reconcile

- [x] Update README and AI_CONTEXT
- [x] Record anything the workspace pass found that no test could. *Both
      findings were already written up in 5.1 above and in AI_CONTEXT; the
      README says them now too, because a reader who never opens a spec should
      still learn that the pass found two defects and that both were found by a
      person reading output rather than by anything automated.*
- [x] Full gate set, then merge

**The spec is closed except for two boxes a one-person workspace cannot reach.**
66 of 68. Both need a second Slack account: every account in the sandbox matches
a member, so the automatic path always succeeds and the guidance a stranger
should get is unreachable from inside it. That is work with a prerequisite
nobody has yet rather than work left undone, and it is worth the distinction —
an open box that cannot be closed reads like neglect unless it says why.

---

## Phase 6: The signature fails closed

Opened 2026-09-25 by an external review, against a spec that had been closed
since 2026-09-23. Not a change of design — a defect in the one thing this spec
calls its root of trust.

`verifySlackSignature` read its key as `process.env.SLACK_SIGNING_SECRET ?? ''`,
so a deployment without the variable computed every HMAC from an empty string.
An empty key is public knowledge, so a forged request verifies. Startup did not
require the variable either: `assertProductionReady` accepts
`RESEND_API_KEY || SLACK_BOT_TOKEN`, and the signing secret appears in neither
the check nor `StartupEnvironment`. `docs/deployment.md` then described the
variable's absence as meaning "Slack delivery is skipped silently", which is
true of outbound delivery and false of the inbound routes.

**Production was never exposed.** Checked before any code changed: a real
`/healthcheck` returned a normal ephemeral reply, which an empty key could not
have produced, and both Slack variables are scoped to Production alone.

- [x] 6.1 Add the requirement the code was missing
  - NFR 1.3 (reject when the key is absent or blank) and NFR 1.4 (startup
    requires it wherever Slack is configured), reconciled against Requirement
    5.2 so an email-only deployment stays legitimate
  - _Requirements: Slack Sign In NFR 1.3, NFR 1.4_

- [x] 6.2 Reject when the secret is absent or blank
  - Failing test first: a signature forged with an empty key against an
    unset `SLACK_SIGNING_SECRET`, asserting the request is refused rather than
    asserting which branch ran
  - Red proved the defect rather than describing it. Two of the three new
    scenarios failed against the old code — blank and unset, each forged with
    the empty key anybody could have guessed. The third, a genuine Slack
    signature against a deployment with no secret, passed all along: a real
    key never matched an empty one. Only the forgeries got in
  - The caller is refused with the message a wrong signature gets, so a 403
    does not disclose whether the deployment is configured. The operator gets
    the real reason through `console.error`, naming the variable and never a
    value
  - _Requirements: Slack Sign In NFR 1.3_

- [x] 6.3 Require the secret at startup wherever Slack is configured
  - `SLACK_SIGNING_SECRET` joins `StartupEnvironment`; a bot token without it
    aborts. Email-only and Slack-complete deployments both still start
  - Conditioned on the bot token rather than required outright, because
    Requirement 5.2 says an email-only deployment is legitimate and a guard
    that made one set a Slack variable would break a working arrangement to
    fix one nobody is using
  - **An existing test asserted the contract this changes.** "starts with
    Slack alone" passed `SLACK_BOT_TOKEN` by itself, because that was the
    whole of what "Slack is configured" meant. It now passes both, and says
    why in place rather than silently gaining an argument
  - No wiring gap to close: `instrumentation.ts` passes `process.env` whole,
    so the new field is read as soon as the interface declares it
  - _Requirements: Slack Sign In NFR 1.4, 5.2_

- [x] 6.4 Correct what the deployment guide claims
  - The optional-variable table called the absence harmless — "Slack delivery
    is skipped silently", true of outbound and false of the three inbound
    routes. A new section, *Both Slack variables or neither*, says what the
    entry used to claim and why it was wrong, rather than quietly replacing it
  - Listed third on purpose: a reader who believed that table had no reason
    to open the code, so the documentation was load-bearing for the defect
    rather than incidental to it
  - _Requirements: Slack Sign In 5.4, NFR 1.3_

**Phase 6 is complete.** The spec stands at 70 of 72; the two that remain are
the pair a one-person workspace cannot reach.

---

## Roadmap, deliberately unscheduled

- **OAuth "Sign in with Slack".** The full identity product. Unnecessary while
  signed requests already prove identity, and it would add a token to store.
- **Retiring the pairing-code flow.** It still serves someone already signed in
  who wants to link Slack. Revisit once phase 3 has seen real use.
- **Multi-workspace.** Blocked behind multi-team, which is its own future spec.
