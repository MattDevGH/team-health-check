# Implementation Plan

Small, and mostly done by the time it was written down — which is the thing this
spec is about, so it is worth saying plainly rather than backdating.

The checker was built first and the requirements second, because the checker is
what produced the evidence the requirements are written from. That is the
exception the rule allows for: the work *was* the investigation. Everything from
here follows Requirement 4.

---

## Phase 1 — Make a citation checkable

### 1.1 Resolve a reference to a requirement that exists

- [x] Failing test: a bare reference resolves against the original spec
- [x] Failing test: a qualified reference resolves against the spec it names
- [x] Failing test: a criterion beyond the ones listed fails, naming how many
      there are — the failure that actually happened
- [x] Failing test: an invented spec fails, naming the spec it could not find
- [x] Failing test: the forms the codebase uses — `NFR`, semicolons, `Original`,
      `Integration` — all parse
- _Requirements: Traceability 1.1, 1.2, 1.3_

### 1.2 Check the real tree

- [x] A script over `src`, `e2e` and `scripts`
- [x] Comments only, so a broken reference used as test data is not counted
- [x] Reports how many citations it verified, so a vacuous pass is visible
- [x] Names the file, the reference as written, and what is wrong
- _Requirements: Traceability 1.4, 1.5, 2.2, 2.3_

### 1.3 Run it without being remembered

- [x] Wired into CI, on every pull request
- [x] Mutation check: a deliberately broken citation fails the run — tried three ways: an unknown spec, an unknown requirement, and a criterion beyond the list
- _Requirements: Traceability 2.1_

**Checkpoint:** a citation that leads nowhere fails a run. One PR.

---

## Phase 2 — Fix what it found

### 2.1 Qualify the citations that mean another spec

- [x] The `10.6` cluster — ten files citing integration-hardening's Requirement
      10 with a bare number that resolves to the original spec's, where it means
      something else entirely
- [x] `Dashboard Refinement 4.5`, which named a requirement with four criteria. No requirement covered the behaviour at all, so one was written: Manager Experience 2.8
- _Requirements: Traceability 1.3_

### 2.2 Correct the requirement text that drifted

- [x] Requirement 18.4 said the audit log is reached via the team settings page;
      it has had a route of its own in the navigation for some time. Corrected,
      with a note saying what it replaced
- [x] A sweep for others of the same kind — the checker is the sweep, and every one of 872 citations now resolves
- _Requirements: Traceability 3.3_

**Checkpoint:** every citation in the tree resolves. Same PR as phase 1.

---

## Phase 3 — Make the specs say what is built

### 3.1 Reconcile the task lists

- [ ] `deployment`: 0 of 62 ticked, phases 1–4 built and running in production
- [ ] `reaching-your-health-check`: 0 of 48 ticked, phase 1 built with browser
      coverage
- [ ] Each box checked against the code or a test that exercises it — never
      ticked in bulk
- [ ] Anything that cannot be confirmed stays unticked, with a note saying so
- _Requirements: Traceability 3.1, 3.2_

**Checkpoint:** "what is left?" is answered by reading. One PR.

---

## Phase 4 — Write the rule down

### 4.1 The requirement comes first

- [x] `AGENTS.md` records it, where the project's other standing rules live
- [x] Stated with the reason: the invented citation happened because the fix was
      small enough that nobody opened the requirements
- [x] Says what to do when no requirement covers the change — add one
- _Requirements: Traceability 4.1, 4.2, 4.3_

**Checkpoint:** the rule outlives the conversation. Same PR as phase 3.
