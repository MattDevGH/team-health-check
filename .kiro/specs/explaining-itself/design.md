# Design Document

## Overview

Five findings, one theme: the application knows why it is showing you nothing
and does not say. Each fix is small; what makes them a milestone is that they
share a cause worth naming.

## Key Decisions

### 1. Three silences, three different sentences

A closed check with no scores on the dashboard can mean:

- **not computed yet** — closed within the last few minutes, waiting on a tick
- **suppressed** — fewer than three people answered, in a team promised anonymity
- **unanswered** — nobody responded

These were indistinguishable, and one of them resolves itself in five minutes
while another never will. A reader who cannot tell them apart learns to distrust
the whole page.

The distinction already exists in the data: aggregates absent for a closed
session is the first, `responseCount` below the threshold is the second, and the
dashboard-refinement work already made the third representable. Only the words
are missing.

**"Results are being prepared" names a wait, not a failure**, and says minutes —
because the alternative is a reader refreshing indefinitely or concluding the
close did not work.

### 2. Submitting keeps the form, and changes what the button says

The tool allows revision until close, and a member who believes their answers
are final will answer more cautiously. So submitting must not take the form
away.

But a form that looks identical before and after saving is why re-submitting
read as submitting twice. The change is in the words: the control becomes
*update*, and a confirmation says the answers are saved and can still be
changed.

Agreed 2026-09-14: confirm and offer a way back, rather than a firm ending or a
redirect. A redirect was rejected because a member on a session link may have
nowhere to be sent — they arrived from a prompt and may not be signed in to
anything else.

**The way onward has to work for both audiences.** A signed-in member can go to
their health check page; someone on a session link alone cannot. The link is
offered where it will work and the confirmation stands alone where it will not.

### 3. The dashboard stays open to everyone; Settings does not

Revised during the discussion, and the revision is right: the dashboard's data
is aggregate and anonymised, and a team should be able to read its own results.
Hiding it would make transparency depend on a role, which is the opposite of
what the tool is for.

The dashboard already gates its Delivery-Manager controls by role —
`page.tsx` reads roles from `/api/me` and hides the lifecycle panel, with an
end-to-end test asserting a contributor sees no open or close controls. That
needs nothing.

**Settings is the one that lies.** The nav offers it to everyone while every
write behind it is manager-only, so a contributor opens a page of controls that
will refuse them. Removing the link is honest.

Navigation is not authorisation, and this does not pretend otherwise: a
contributor typing the URL sees what they saw before. What navigation advertises
and what a route permits are separate concerns, and conflating them would leave
someone believing the nav was a boundary.

### 4. Explanations belong to their controls

Four settings with no explanation is not four missing paragraphs — it is four
controls a member has to experiment with to understand.

Each explanation sits with its control and is associated programmatically
(`aria-describedby`), so a screen reader hears it as part of the control rather
than as stray text nearby. Placing copy visually close is not the same as
connecting it.

The reminders toggle needs particular care: it governs closing reminders and
nudges, deliberately **not** opening prompts, and not sign-in. A member who
turns it off expecting silence will still be prompted when a check opens, and
should know that before they switch it.

### 5. An away period you cannot see is worse than none

Availability can be set and then neither seen nor cancelled. That is a setting
that changes behaviour invisibly and permanently from the member's point of
view — the exact shape of problem this milestone is about, one level deeper.

Showing it is most of the fix. Cancelling needs a delete path, scoped to the
member's own records: nobody sees or cancels anyone else's.

## Correctness Properties

1. **Every absent value has a stated reason.** For any closed session and
   question, the dashboard renders either a value or an explanation.
2. **Suppressed, pending and unanswered are never conflated.** Their messages
   differ, and no state produces two of them at once.
3. **Submission is idempotent and visible.** Resubmitting the same answers
   changes nothing and says so.
4. **Navigation offers only what a member can act on**, for every role.
5. **Away periods are member-scoped.** A member sees and cancels only their own.

## Testing Strategy

| Concern | Tier | Why only this tier |
|---|---|---|
| Which message a given state produces | Unit over a pure selector | A decision table, testable without rendering |
| Pending versus suppressed on the real panels | UI | The two states differ only in data, and the bug was in the rendering |
| The submit control changes after saving | UI | Wording is the fix, so the wording is the assertion |
| Explanations are associated, not merely nearby | UI | `aria-describedby` is the difference, and only the DOM shows it |
| Away period shows and cancels | UI + route | The `privacyMode` defect was a page reading a field the API never sent |
| A contributor's navigation | Unit over `destinationsFor` | Already a pure function, exercised directly |
| The whole loop ends somewhere | E2E | Only a browser proves a member is not stranded |

## Out Of Scope

- **Route authorisation changes.** Requirement 3.4 explicitly freezes it. What
  navigation advertises and what a route permits are separate questions, and
  moving both at once would hide which change caused what.
- **Making materialisation faster.** The 30-second quiet period exists so late
  writes settle; the fix is saying so, not removing it.
- **Email and Slack prompt delivery**, specced in
  `.kiro/specs/reaching-your-health-check/`.
- **Recurring or future-dated availability.** One away period, set and
  cancellable.
- **Renaming the dashboard.** Considered and dropped: "Manage" is worse, and no
  better name emerged.
