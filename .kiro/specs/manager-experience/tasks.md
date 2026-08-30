# Implementation Plan: Manager Experience

## Overview

Five phases, dependency-ordered. Phase 1 unblocks every page that follows;
phase 2 is the milestone's reason for existing; phases 3 and 4 make the dashboard
readable; phase 5 is the identity guard.

All tasks follow TDD (Red → Green → Refactor) and one green behaviour per commit.
Update AI_CONTEXT.md and README.md in the commit that changes behaviour, test
coverage, or conventions — not afterwards.

Phases 1, 2, and 5 each end at a checkpoint. Phase 5 can be taken out of order if
a colleague hits the conflict before the UI work lands.

## Tasks

- [ ] 1. Navigation shell

  - [x] 1.1 Extend `/api/me` with team and roles
    - Write failing route tests: authenticated request returns `team: {id, name}` and `roles`; a member with no roles returns `[]`; 401 unchanged
    - Resolve via `repos.team.findById` and `repos.teamMemberRole.findByMemberAndTeam`
    - Keep the handler thin; assert the response body, not that the repositories were called
    - _Requirements: 1.1, 1.3_
    - **Done.** Five route tests, all asserting the response body. One covers a
      role held by a *different* member of the same team, because
      `findByMemberAndTeam` scoped only by team would still pass every other
      role assertion. `team` is `null` when the team record cannot be resolved —
      unreachable in production behind the Prisma foreign key, and the shell
      treats it exactly as it treats a team it has not loaded yet.
      1198 Vitest tests, `tsc --noEmit`, and lint all green.

  - [x] 1.2 Implement the shell component
    - Write failing component tests: nav landmark labelled "Main"; Dashboard, Settings and Profile links present; skip link is the first focusable element and targets `#main`; active destination carries `aria-current="page"`
    - Implement `src/components/app-shell/app-shell.tsx` fetching `/api/me` on mount
    - Active state uses `usePathname()`, matched by segment
    - _Requirements: 1.1, 1.2, 1.5_
    - **Done.** Ten component tests. Tab order is asserted by actually pressing
      Tab and checking focus, not by reading the DOM order, and the skip link's
      target is asserted to exist — a skip link pointing at nothing passes every
      other check. `samePath` ignores a trailing slash, so a pathname arriving
      with one cannot leave every destination unmarked.
    - A default `GET /api/me` handler was added to `src/tests/mocks/handlers.ts`
      in the same commit as the route change of 1.1, carrying `team` and
      `roles`. Tests needing another role set or a 401 override it.
    - The non-colour active treatment (weight plus underline) is not asserted
      here: pinning Tailwind classes in a unit test asserts what was just typed.
      It is covered by the manual pass in 1.6.

  - [x] 1.3 Role-conditional links and the loading state
    - Write failing tests: a member without `delivery_manager` gets no audit-log link; during the in-flight fetch no team-scoped link is rendered; a 401 renders no nav at all
    - **Property 1: a Delivery-Manager-only link renders iff the fetched roles contain `delivery_manager`** — generate random role sets
    - _Requirements: 1.3, 1.7_
    - **Done.** The shell now distinguishes three states: loading keeps the
      landmark and offers only Profile, ready offers everything the member can
      reach, and anonymous — a 401 or an unreachable endpoint — removes the
      shell entirely.
    - The audit log is the only Delivery-Manager-only *read* in the API
      (`api/teams/[teamId]/audit-log/route.ts:43`). Every other manager-gated
      route is a write behind a control on a page both roles can open, so it is
      the only role-gated entry in the nav. Lifecycle controls are gated
      separately in phase 3.
    - Every absence is asserted only after a destination every member gets has
      rendered. `queryByRole(...).not.toBeInTheDocument()` against a shell that
      has not finished rendering passes for the wrong reason.
    - **Property 1 was mutation-checked.** Replacing `roles.includes` with
      `roles.some(r => r.includes(...))` failed after one run and shrank to
      `["deputy_delivery_manager"]`. Every example-based test in the file still
      passed under that mutation.
    - 1215 Vitest tests, `tsc --noEmit`, and lint all green.

  - [x] 1.4 Sign out
    - Write a failing test: activating sign out posts to `/api/auth/logout` and navigates to `/`
    - Assert the resulting location, not that a handler fired
    - _Requirements: 1.4_
    - **Done.** The first sign-out control in the product — nothing anywhere
      called `/api/auth/logout` before this.
    - The POST is counted inside the MSW handler, so the assertion is that a
      request crossed the network boundary, not that our own function ran.
    - Navigation happens only after the server answers, and a failed revoke
      keeps the member where they are with a `role="status"` message. Telling
      someone they are signed out while their token is still valid is the
      failure worth designing against, since `POST /api/auth/logout` is what
      revokes the `UserSession` row — clearing the cookie alone leaves a
      working token on record.
    - **Mutation-checked:** moving `router.push('/')` above the fetch failed
      both the failure-path test and the in-flight test.
    - `router.refresh()` follows the push so a Back navigation cannot re-render
      a cached authenticated page after its session was revoked.
    - Sign out is a `<button>` outside the nav list: it is an action, not a
      destination. The skip-link tab-order test still passes with it present.
    - 1219 Vitest tests, `tsc --noEmit`, and lint all green.

  - [x] 1.5 Mount the shell on authenticated segments
    - Add `src/app/teams/[teamId]/layout.tsx` and `src/app/me/layout.tsx`
    - Confirm by test that `/auth/login`, `/`, and `/session/[token]` render no nav landmark
    - Verify narrow-viewport usability with Playwright at 375px: no horizontal scroll
    - _Requirements: 1.6, 1.7_
    - **Done.** Four authenticated pages rendered their own `<main>`, so
      mounting the shell nested one landmark inside another. The shell now owns
      the single `main`; the dashboard, settings, audit-log and profile pages
      wrap their content in a `div`. Axe's `landmark-one-main` is a
      best-practice rule outside the WCAG A/AA tag set the suite asserts, so
      the E2E spec asserts `main` count directly rather than relying on it.
    - **"This route has no navigation" is unprovable in jsdom.** Rendering a
      page component never composes its layouts, so such a test passes whether
      or not a shell wraps the route in production. Two things cover it
      instead: `src/tests/contracts/app-shell-mounting.test.ts` scans the route
      tree and pins the exact set of layouts that mount the shell, and
      `e2e/navigation.spec.ts` visits the real routes.
    - `<main>` carries `tabindex="-1"`. Without it a browser only moves the
      sequential navigation start point, so focus stays on the skip link and a
      screen reader is never told it arrived. The E2E test asserts where focus
      lands, not that the URL gained a fragment.
    - Sign-out is now proven end-to-end: `countUserSessions` reads the
      `UserSession` row back from the E2E database after the click. A cleared
      cookie alone would pass even if the server had done nothing.
    - **Found by running it:** magic links are rate-limited to five per email
      per hour, process-wide (`auth.service.ts:61`). A spec signing the same
      member in from eight tests silently stopped receiving tokens partway
      through and hung on the verification page, nowhere near the cause. Fixed
      with a `seedMember` helper and one member per test, which also leaves
      three of the five for CI retries.
    - Live check against the production build on the E2E database: the
      accessibility tree is skip link → banner → `navigation "Main"` → sign out
      → one `main`; computed styles give the current destination
      `font-weight: 600` plus `text-decoration: underline` against `400` and
      `none`, so Requirement 1.2's non-colour indicator is confirmed with real
      CSS rather than asserted class names.
    - 1226 Vitest tests, 38 Playwright tests with zero skips, `tsc --noEmit`,
      lint, and build all green.

  - [x] 1.6 Accessibility pass over the shell
    - Extend `e2e/accessibility.spec.ts` to cover the shell on the dashboard, settings, and profile
    - Manual keyboard pass: tab from page load, confirm the skip link appears on focus and moves focus to main content. Record the outcome here:
      - **Result:** driven from Playwright in Chromium, not by hand. Tabbing from
        page load reaches `Skip to main content` first; it becomes visible on
        focus; Enter moves focus onto `<main>` (asserted as focus, not as a URL
        fragment). Full order is skip link → Dashboard → Settings → Audit log →
        Profile → Sign out, then page content. Recorded as an assertion in
        `e2e/navigation.spec.ts` so a regression is caught rather than
        remembered.
      - **Still outstanding, and not claimable from this:** a screen-reader pass
        (NVDA or VoiceOver), and a human judgement on whether the announced
        order and labels make sense. Automated checks find roughly a third to a
        half of WCAG issues; none of them can tell you the experience is good.
    - _Requirements: NFR 1.1, 1.2, 1.3_
    - **Axe coverage added:** the profile page (never audited before this
      milestone), the shell with the skip link focused, the sign-out failure
      message, and the dashboard at 320px.
    - The skip link is clipped to 1×1 until focused, which axe treats as hidden
      and skips — its contrast is only ever checked in the focused state.
    - 320px is the width WCAG 2.1 AA 1.4.10 (Reflow) actually specifies, being a
      1280px viewport at 400% zoom. The 375px check in the navigation spec is a
      phone, not the criterion.
    - The sign-out failure state needs a provoked 500, and the browser logs the
      failed response, which the strict fixture rightly fails on. Rather than
      widen the global allowlist and blind the suite to real 500s,
      `allowConsoleErrors(page, pattern)` scopes the exception to the test that
      asked for it.
    - **Fixed while here:** `seedTeam` revoked only its own member's sessions
      before deleting every member of the team, so re-running `beforeAll` after
      a failure hit a foreign key once a team also held `seedMember` members who
      had signed in. Cleanup is now team-wide across `UserSession`, `MagicLink`
      and `SlackIdentityLink`. The a11y spec's three authenticated tests also
      shared one email, which with CI's two retries could exceed the
      five-per-hour magic-link limit; each test now has its own member.
    - 1227 Vitest tests, 43 Playwright tests with zero skips, `tsc --noEmit`,
      lint, and build all green.

- [x] 2. Checkpoint — navigation shell
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.
  - **Gates:** 1227 Vitest tests across 152 files, `tsc --noEmit`, lint with zero
    warnings, production build, and 43 Playwright tests with zero skips. Five
    consecutive full unit runs were clean after the fixes below.
  - **Three flakes found and fixed during this checkpoint**, all pre-existing and
    none introduced by phase 1:
    1. The scheduler tick ran on two clocks (fixed in `7648e21` during 1.5).
    2. `session-link/[token]/route.test.ts` compared timing drift against fixed
       constants. CI failed a *docs-only* commit with `expected 1001 to be less
       than or equal to 1000` — a claim about machine speed, not about the code.
       Assertions now bound by the measured request window; the cap itself is
       still asserted exactly, since that is the security-relevant direction.
       Mutation-checked by adding 5 seconds to the route's `Max-Age`.
    3. Property 19 in `csv-export.property.test.ts` searched the whole CSV for
       each generated member name, so the name `e C` matched `Response Count` in
       the header and reported a leak that had not happened.
  - **The checkpoint earned its place.** None of these were visible from a
    single green run; two were found only because full output was captured
    instead of a summary line.
  - **Outstanding for the user, not blocking phase 3:**
    - A screen-reader pass (NVDA or VoiceOver). No AA conformance claim without it.
    - A visual look at the shell. The Browser pane was not displayed, so no
      screenshot was captured; the accessibility tree and computed styles were
      checked instead.
    - Whether to merge phase 1 to `master` now or continue on this branch.

- [ ] 3. Session lifecycle control

  - [x] 3.1 Derive Session_State
    - Write failing unit tests for a pure `deriveSessionState(sessions, aggregatedSessionIds)` covering all four states from the design table
    - **Property 2: exactly one state is derivable from any session list, and the offered control matches it**
    - _Requirements: 2.4, 2.7_
    - **Done.** `src/components/session-lifecycle/derive-session-state.ts`.
      Eight example tests, three properties, 11 assertions in total.
    - The latest closed session is chosen by `actualCloseAt`, not array order:
      the sessions endpoint gives no ordering guarantee, and reading the array
      as ordered would show a manager the wrong check. A closed session with no
      recorded close time sorts oldest, which keeps the comparison total.
    - **Honest note on the properties.** They cover tie-breaking between equal
      close times, materialisation sets naming sessions the team never had, and
      the invariant that the control never contradicts the status. They do not
      dominate the example tests here — a `findLast`-instead-of-`find` mutation
      survived both, correctly, because the service enforces at most one open
      session per team so the two are equivalent in practice. The examples carry
      most of the weight at this task; the properties will matter more once the
      panel feeds them real API data.

  - [x] 3.2 Open a session from the dashboard
    - Write a failing component test: a Delivery Manager sees an open control when nothing is open; activating it POSTs to `/api/teams/{id}/sessions` and the panel then shows the collecting state without a reload
    - Assert the rendered state after the response, not the fetch call
    - _Requirements: 2.1, 2.2_
    - **Done.** `SessionLifecyclePanel` renders all four states and offers the
      open control for three of them. Six component tests.
    - The MSW handlers mirror the real routes exactly, **including dates as ISO
      strings**. The route serialises `HealthCheckSession` straight to JSON, so
      the component receives strings where `deriveSessionState` needs `Date`s.
      A mock returning `Date` objects would have let the component skip parsing
      and still pass, while the real page threw on the first date comparison —
      the same shape of defect as the audit log. One test seeds two closed
      sessions specifically to force that comparison.
    - The panel refetches after opening rather than trusting the created
      session: opening also closes any session already open, so the list is the
      only account of what the team now has. **Mutation-checked** — dropping the
      refetch fails the test.
    - The POST is counted in the handler, so the test asserts a request crossed
      the network as well as what the manager now sees.
    - `react-hooks/set-state-in-effect` rejected calling a `useCallback` loader
      from the effect body. Data fetching is now a plain function outside the
      component and the effect updates state from its callback, which is
      cleaner anyway.
    - Not yet wired into the dashboard page — that lands with 3.3, which needs
      the trends response for response counts.

  - [x] 3.3 Display the collecting state
    - Write failing tests: response count and scheduled close time shown while a session is open
    - Counts come from the participation endpoint; use `pluralise` from task 5.1 if that has landed, otherwise correct the copy here and delete the duplication when it does
    - _Requirements: 2.4_
    - **Done.** "3 of 8 answered" and "Closes on 28 August 2026" while a check
      is collecting. The count-of-total phrasing sidesteps singular/plural
      entirely, so no `pluralise` helper is needed here and there is nothing for
      task 5.1 to come back and deduplicate.
    - A failed participation request does not hide the fact that a check is
      running; the count is simply omitted. Same for a session with no
      scheduled close — the panel says nothing rather than inventing a date.
    - Participation is stored **with the session id it describes**, so a count
      from a previous check can never be shown against the current one. That
      shape was forced by `react-hooks/set-state-in-effect` rejecting a
      synchronous reset, and is more correct than what it replaced.
    - Panel mounted on the dashboard, in **every** data state: a team with no
      closed sessions is exactly the team that most needs to open its first
      check. Materialised session ids come from the trends response the page
      already fetches, so the panel costs no extra request.
    - The dashboard fetches `/api/me` for roles rather than sharing the shell's
      copy. A context would couple the page to being rendered inside that
      layout; one small GET keeps it standing on its own.

  - [x] 3.6 Hide controls from non-managers
    - **Pulled forward into 3.3.** Mounting the panel without the gate would
      have left the branch in a state where a contributor sees a button that
      403s, which the commit discipline rules out. Covered by a dashboard test
      and by `e2e/session-lifecycle.spec.ts`.
    - _Requirements: 2.6_

  - [x] 3.4 Close with confirmation
    - Write failing tests: activating close opens a dialog and issues **no** request; confirming issues the PATCH; cancelling issues none and returns focus to the trigger
    - Native `<dialog>`, not `window.confirm`
    - _Requirements: 2.3_
    - **Done.** Five component tests and three browser tests. The PATCH is
      counted in the handler, so "asking the question must not also answer it"
      is asserted as a request count, not as rendered text.
    - **jsdom 29.1.1 implements neither `showModal()` nor the `cancel` event**
      (checked before writing the component, not after). The component calls
      `showModal()` when it exists and sets the `open` property when it does
      not, so the confirmation stays assertable in jsdom while real browsers get
      true modality. Escape is handled explicitly as well as through `cancel`,
      because a dialog opened without `showModal()` gets no Escape handling from
      the browser at all.
    - **Found by running it in a browser:** focus did not return to the trigger
      after Escape. Cancelling focused the trigger *before* closing the dialog,
      and while a modal is open everything outside the top layer is inert — so
      the call was silently ignored and the keyboard user was left on `body`.
      The dialog is now closed first. jsdom could never have caught this: with
      no top layer there is nothing to be inert.
    - The browser test asserts `:modal` matches, so a regression to a
      non-modal `<dialog open>` fails rather than passing on appearance.
    - Each closing test has its own team with its own running check: sharing one
      would couple them by order, and sharing a member would spend two of the
      five magic links an email gets per hour, which CI's two retries exhaust.

  - [x] 3.5 Post-close state and failure handling
    - Write failing tests: immediately after close the panel says results are still being prepared; a failed open or close renders the server's message and leaves the previous state displayed
    - _Requirements: 2.5, 2.7_
    - **Done.** The post-close state landed with 3.1's `awaiting_results`; this
      task added failure handling.
    - The panel shows the server's own words — "Session is already closed" tells
      a manager what happened, "Something went wrong" does not. The generic
      fallback is only for responses carrying no message at all.
    - A failed action leaves the displayed state exactly as it was. Claiming a
      check is running because the request to start one failed is worse than
      reporting that nothing happened, so the tests assert the *old* state is
      still on screen, not merely that an error appeared.
    - `role="alert"`, because the message follows an action the manager took and
      they need to know it did not happen.
    - A failed close dismisses the confirmation rather than leaving it open: the
      failure belongs beside the check it concerns, and the manager needs the
      close control back to retry.

  - [x] 3.6 Hide controls from non-managers — **done as part of 3.3, see above**
    - A contributor sees no panel at all rather than the state without controls:
      the panel exists to act, and the dashboard already shows the trend data
      that is a contributor's stake in the check.

  - [x] 3.7 Drive open and close through the UI in the E2E journey
    - Replace the `page.request.post` / `page.request.patch` calls in `e2e/journey.spec.ts` with UI interactions, and delete the comments explaining their absence
    - The scheduler tick stays an API call: it is a cron endpoint with no UI by design
    - _Requirements: NFR 2.1_
    - **Done.** The journey opens a check from the dashboard button and closes it
      through the confirmation, twice over. The comment explaining why the API
      was used is gone, because the reason is gone.
    - Closing also cross-checks that no open session remains, so the journey
      proves the server acted rather than that the page changed its mind.
    - The scheduler tick remains the single API call, as designed.

  - [x] 3.8 Accessibility pass over the lifecycle panel
    - axe over the panel and the open confirmation dialog
    - Manual keyboard pass: open the dialog, confirm focus moves into it, Escape cancels, focus returns to the trigger. Record the outcome here:
      - **Result:** driven from Playwright in Chromium, not by hand. Focusing the
        close control and pressing Enter opens the dialog with focus already on
        the confirm button; Tab reaches Cancel; Enter dismisses it and focus
        returns to the trigger with the check still running. Pressing Enter
        again reopens and confirms, and the check closes. Escape is covered
        separately, and the dialog is asserted to match `:modal`, so a
        regression to a non-modal `<dialog open>` fails rather than passing on
        appearance.
      - **Still outstanding:** a screen-reader pass. Nothing automated can say
        whether the dialog is announced sensibly when it opens.
    - axe covers the panel while a check is collecting, and the confirmation
      dialog itself — a state that exists only after a click and renders over an
      inert page.
    - _Requirements: NFR 1.1, 1.2, 1.3_

- [x] 4. Checkpoint — lifecycle control
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.
  - **Gates:** 1262 Vitest tests across 155 files, `tsc --noEmit`, lint with zero
    warnings, production build, and 51 Playwright tests with zero skips — run
    twice, clean both times.
  - **Two defects the full-suite run exposed that per-spec runs did not**, both
    introduced by this phase:
    1. The tab-order test waited for the navigation landmark, which the shell
       renders with Profile alone while `/api/me` is in flight. Once the
       dashboard also began fetching `/api/me` and the sessions list, the page
       became slow enough for the test to tab through a half-built nav. It now
       waits for a team-scoped link, which only exists in the ready state.
    2. `seedTeam` deleted responses and session links by *session*, which was
       enough while every session was seeded but not once tests create sessions
       by clicking "Open a health check". Cleanup now enumerates every table
       holding a foreign key to a member of the team, which stays correct as
       tests gain new ways to write rows.
  - Neither would have appeared in a spec run on its own. The second only fires
    on the retry after a first failure — precisely when a suite can least afford
    a second, unrelated error.
  - **A third, found by CI and not reproducible locally at all.** The panel
    formatted dates with `toLocaleDateString(undefined, …)`, so the same close
    time read as "28 August 2026" on a British machine and "August 28, 2026" on
    the runner. Windows ignores `LANG`, so no local run could have shown it. The
    locale is now pinned to `en-GB`, matching the trend chart, which already
    names its own months.
  - **Follow-up recorded, not guessed at:** dates render in the *viewer's*
    timezone, which is right for a person reading them but not necessarily right
    for the team — a check closing at 23:30 UTC falls on different days either
    side of midnight. The team already stores a timezone; using it here needs it
    plumbed to the panel and belongs in its own change.

- [ ] 5. Dashboard comprehension

  - [ ] 5.1 Pluralisation helper
    - Write failing tests for `pluralise` in `src/lib/format.ts`
    - **Property 3: the rendered noun is singular iff the count is 1** — generate non-negative integers
    - Replace `{count} responses` at every call site
    - _Requirements: 3.7_

  - [ ] 5.2 Chart caption and legend
    - Write failing tests: the figure has a caption naming what is plotted; every plotted question appears in the legend by name
    - _Requirements: 3.1, 3.2_

  - [ ] 5.3 Accessible data table
    - Write failing tests: the table exposes score, response count, question name, and session date for every plotted point; values match those given to the chart
    - Cross-check one rendered value against the seeded aggregate rather than against the component's own props
    - _Requirements: 3.3, 3.4_

  - [ ] 5.4 Replace the Latest Session panel
    - Write failing tests: per question, average score, change from the previous session stated in text, and response count; suppressed values say they are suppressed rather than rendering blank
    - _Requirements: 3.5, 3.6_

  - [ ] 5.5 Question disclosure semantics
    - Write failing tests: the trigger carries `aria-expanded` reflecting state and `aria-controls` naming the panel; the panel is reachable and toggleable by keyboard
    - _Requirements: 3.8, 3.9_

  - [ ] 5.6 Re-anchor the E2E selectors
    - Replace `page.locator('div.border-l-2')` in `e2e/dashboard.spec.ts` and `e2e/journey.spec.ts` with a lookup through the accessible relationship
    - _Requirements: NFR 2.2_

- [ ] 6. First-run guidance

  - [ ] 6.1 Guidance component
    - Write failing tests for each condition in the design table, including that the banner disappears once its condition is false
    - Assert the text a manager reads, not a test id
    - _Requirements: 4.1, 4.2, 4.6_

  - [ ] 6.2 Empty and single-session dashboard states
    - Write failing tests: no closed sessions explains trends appear after a close; exactly one closed session explains a second is needed
    - _Requirements: 4.3, 4.4_

  - [ ] 6.3 Explain anonymity suppression at the point of use
    - Write a failing test: with anonymous privacy mode, the dashboard states that detail is hidden below the threshold
    - _Requirements: 4.5_

  - [ ] 6.4 Accessibility pass over guidance states
    - axe over each guidance state in `e2e/accessibility.spec.ts`
    - _Requirements: NFR 1.1_

- [ ] 7. Ambiguous identity guard

  - [ ] 7.1 `findAllByEmail`
    - Write failing tests for the in-memory fake and an integration test over a real SQLite file proving two members in different teams share one email
    - Add to `TeamMemberRepository`, the Prisma implementation, and the fake
    - The integration test is the point: the schema permits this, and only the database can prove it
    - _Requirements: 5.4_

  - [ ] 7.2 Reject conflicting member additions
    - Write failing service tests: adding an email held by a member of another team throws `ConflictError`; the same email within the same team behaves as it does today; members without an email are unaffected
    - **Property 5: for any email held by a member of another team, `addMember` throws and the member count is unchanged**
    - Assert the member count and audit-log length after the throw
    - _Requirements: 5.1, 5.2_

  - [ ] 7.3 Guard magic-link issuance
    - Write failing tests: two matching members creates neither a magic link nor a pending genesis record; one matching member is unchanged; none is unchanged
    - **Property 4: no token of either kind is created for an ambiguous email**
    - **Property 6: `requestMagicLink` returns without throwing for every input**
    - _Requirements: 5.3, 5.4, 5.6_

  - [ ] 7.4 Log the collision
    - Write a failing test asserting the log carries the email and both team ids
    - _Requirements: 5.5_

  - [ ] 7.5 Document the limitation
    - README: a person belongs to exactly one team; colleagues each run their own team
    - AI_CONTEXT: the constraint, why it exists, and that multi-team support is a future spec
    - Note how an operator resolves a pre-existing conflict: remove the duplicate member row, or change one email
    - _Requirements: 5.8_

- [ ] 8. Checkpoint — identity guard
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.

- [ ] 9. Reconcile and merge
  - Update requirements/design/tasks to match what was built, including any decision that changed during implementation
  - Update README.md and AI_CONTEXT.md
  - Run every gate, push, and merge through a green PR

## Slack parity note

Nothing in this spec changes the Slack surface. A member who answers in Slack is
unaffected by the shell, the lifecycle panel, and the guidance. The identity
guard touches Slack only in that `SlackIdentityLink.memberId` is already unique,
so a Slack account already maps to exactly one member.
