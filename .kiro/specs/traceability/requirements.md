# Requirements Document

## Introduction

Source files in this project cite the requirement they serve — 872 citations
across 219 files. The citations are the only thread between what was asked for
and what was built, and nobody reads them until something is wrong, which is
exactly when they need to be true.

On 2026-09-15 a citation to "Manager Experience 5.x" reached a pull request
description. The requirement had never existed. It was caught by the existing
coverage gate for the wrong reason — that gate checks the *description mentions*
a requirement, not that the requirement is real — and then only because a person
happened to look.

Matt's question was broader: are the specs drifting from the code? Measured, the
answer is narrower than it sounds. 858 of 872 citations resolve. What has drifted
is three specific things:

- **Ambiguity.** A bare `10.6` is a broken reference to the original spec and a
  correct one to integration-hardening. Ten files cite it meaning the second.
- **Status.** `deployment` shows 0 of 62 tasks ticked while running in
  production; `reaching-your-health-check` shows 0 of 48 with phase 1 built and
  covered by browser tests.
- **Text.** Requirement 18.4 said the audit log is reached "via the team
  settings page". It has had a route of its own in the navigation for some time.

None of that is fiction. It is a record that stopped being updated at the
moment the work landed, which is the moment it was least convenient and most
important.

## Glossary

- **Citation**: a `Requirements:` line in a source file's doc comment.
- **Bare reference**: a number with no spec name, e.g. `18.2`.
- **Qualified reference**: a spec name and a number, e.g. `Explaining Itself 1.4`.
- **Resolves**: names a spec that exists, a requirement in it, and a criterion
  that requirement actually lists.

## Requirements

### Requirement 1: A Citation Points At Something Real

**User Story:** As whoever maintains this next, I want a requirement reference to lead somewhere, so that the thread between the ask and the code holds.

#### Acceptance Criteria

1. Every citation in `src`, `e2e` and `scripts` SHALL name a spec that exists, a requirement within it, and a criterion that requirement lists.
2. A bare reference SHALL mean the original spec, `team-health-check`, because that is the convention 654 existing citations already follow.
3. A citation belonging to any other spec SHALL name that spec.
4. A citation that cannot be resolved SHALL fail a run, naming the file, the reference as written, and what is wrong with it.
5. THE check SHALL read citations from comments only, since a string in a test may contain a deliberately broken reference as data.

### Requirement 2: The Check Runs Without Being Remembered

**User Story:** As a reviewer, I want a broken reference to fail before I read the diff, so that the thread is kept by the run rather than by vigilance.

#### Acceptance Criteria

1. THE check SHALL run in CI on every pull request.
2. THE check SHALL be runnable locally by one command.
3. THE check SHALL report how many citations it verified, so a run that silently checked nothing is visible as such.

### Requirement 3: A Spec Says What Is Built

**User Story:** As a delivery manager, I want a spec's task list to reflect reality, so that "what is left?" is answered by reading rather than by asking.

#### Acceptance Criteria

1. WHERE a task's behaviour is built and covered by tests, its checkbox SHALL be ticked.
2. A checkbox SHALL NOT be ticked without verifying the behaviour exists — the 2026-08-23 closure audit found tasks marked complete before the behaviour existed, and a false tick is worse than an unticked one.
3. WHERE a requirement's text no longer describes what was built, it SHALL be corrected, and the correction SHALL say what it replaced rather than quietly overwriting it.

### Requirement 4: The Requirement Comes First

**User Story:** As whoever picks this up, I want the reasoning recorded before the code, so that a change can be understood by someone who was not in the conversation.

*This is the rule the invented citation broke: the fix was small, so the requirements were never opened, so a number was written from memory.*

#### Acceptance Criteria

1. WHERE a change is more than a typo, the requirement it serves SHALL be identified before the code is written.
2. WHERE no requirement covers it, one SHALL be added — a requirements commit is legitimate work, not overhead.
3. THIS rule SHALL be recorded in `AGENTS.md`, where the project's other standing rules live.
