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

  - [ ] 1.2 Implement the shell component
    - Write failing component tests: nav landmark labelled "Main"; Dashboard, Settings and Profile links present; skip link is the first focusable element and targets `#main`; active destination carries `aria-current="page"`
    - Implement `src/components/app-shell/app-shell.tsx` fetching `/api/me` on mount
    - Active state uses `usePathname()`, matched by segment
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ] 1.3 Role-conditional links and the loading state
    - Write failing tests: a member without `delivery_manager` gets no audit-log link; during the in-flight fetch no team-scoped link is rendered; a 401 renders no nav at all
    - **Property 1: a Delivery-Manager-only link renders iff the fetched roles contain `delivery_manager`** — generate random role sets
    - _Requirements: 1.3, 1.7_

  - [ ] 1.4 Sign out
    - Write a failing test: activating sign out posts to `/api/auth/logout` and navigates to `/`
    - Assert the resulting location, not that a handler fired
    - _Requirements: 1.4_

  - [ ] 1.5 Mount the shell on authenticated segments
    - Add `src/app/teams/[teamId]/layout.tsx` and `src/app/me/layout.tsx`
    - Confirm by test that `/auth/login`, `/`, and `/session/[token]` render no nav landmark
    - Verify narrow-viewport usability with Playwright at 375px: no horizontal scroll
    - _Requirements: 1.6, 1.7_

  - [ ] 1.6 Accessibility pass over the shell
    - Extend `e2e/accessibility.spec.ts` to cover the shell on the dashboard, settings, and profile
    - Manual keyboard pass: tab from page load, confirm the skip link appears on focus and moves focus to main content. Record the outcome here:
      - Result: _(not yet run)_
    - _Requirements: NFR 1.1, 1.2, 1.3_

- [ ] 2. Checkpoint — navigation shell
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.

- [ ] 3. Session lifecycle control

  - [ ] 3.1 Derive Session_State
    - Write failing unit tests for a pure `deriveSessionState(sessions, aggregatedSessionIds)` covering all four states from the design table
    - **Property 2: exactly one state is derivable from any session list, and the offered control matches it**
    - _Requirements: 2.4, 2.7_

  - [ ] 3.2 Open a session from the dashboard
    - Write a failing component test: a Delivery Manager sees an open control when nothing is open; activating it POSTs to `/api/teams/{id}/sessions` and the panel then shows the collecting state without a reload
    - Assert the rendered state after the response, not the fetch call
    - _Requirements: 2.1, 2.2_

  - [ ] 3.3 Display the collecting state
    - Write failing tests: response count and scheduled close time shown while a session is open
    - Counts come from the participation endpoint; use `pluralise` from task 5.1 if that has landed, otherwise correct the copy here and delete the duplication when it does
    - _Requirements: 2.4_

  - [ ] 3.4 Close with confirmation
    - Write failing tests: activating close opens a dialog and issues **no** request; confirming issues the PATCH; cancelling issues none and returns focus to the trigger
    - Native `<dialog>`, not `window.confirm`
    - _Requirements: 2.3_

  - [ ] 3.5 Post-close state and failure handling
    - Write failing tests: immediately after close the panel says results are still being prepared; a failed open or close renders the server's message and leaves the previous state displayed
    - _Requirements: 2.5, 2.7_

  - [ ] 3.6 Hide controls from non-managers
    - Write a failing test: a member without `delivery_manager` sees the state but no controls
    - _Requirements: 2.6_

  - [ ] 3.7 Drive open and close through the UI in the E2E journey
    - Replace the `page.request.post` / `page.request.patch` calls in `e2e/journey.spec.ts` with UI interactions, and delete the comments explaining their absence
    - The scheduler tick stays an API call: it is a cron endpoint with no UI by design
    - _Requirements: NFR 2.1_

  - [ ] 3.8 Accessibility pass over the lifecycle panel
    - axe over the panel and the open confirmation dialog
    - Manual keyboard pass: open the dialog, confirm focus moves into it, Escape cancels, focus returns to the trigger. Record the outcome here:
      - Result: _(not yet run)_
    - _Requirements: NFR 1.1, 1.2, 1.3_

- [ ] 4. Checkpoint — lifecycle control
  - Full suite, `tsc --noEmit`, lint, build, E2E. Ask the user if questions arise.

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
