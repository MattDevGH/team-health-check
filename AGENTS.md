<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in node_modules/next/dist/docs/ before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Session Context

Read AI_CONTEXT.md at the start of every session.

**After every commit:** update both AI_CONTEXT.md and README.md to reflect any changes to project structure, behaviour, test coverage, or conventions. Do not leave these files out of sync with the codebase.

# The Requirement Comes First

Every source file here cites the requirement it serves. That thread is the only
thing connecting what was asked for to what was built, and nobody reads it until
something is wrong.

`npx tsx scripts/check-requirement-references.ts` prints the current totals. They
used to be written here — "872 citations across 219 files" — and by 2026-09-25
the real figures had passed 1300 across nearly 300. Nothing updated them,
because nothing could: a number in a rules document has no test and no reason
to be revisited.
A file whose job is to say how this repository works should not contain a fact
that rots, so the count now lives where it is computed.

- **Open the requirement before writing the code.** For anything more than a
  typo. The rule exists because a fix was once small enough that nobody
  bothered, and the citation that came out of it — "Manager Experience 5.x" —
  named a requirement that had never existed. It reached a pull request
  description before a person noticed.
- **If no requirement covers the change, add one.** A requirements commit is
  legitimate work, not overhead. `Manager Experience 2.8` was written this way,
  after a test was found citing a criterion nobody had ever added.
- **A bare number means the original spec** (`team-health-check`). A citation
  belonging to any other spec names it: `Explaining Itself 1.4`,
  `Integration 10.6`. `Original` and `Integration` are accepted aliases.
- **`npx tsx scripts/check-requirement-references.ts` must pass.** It runs in
  CI. It catches a citation that leads nowhere; it cannot catch one that leads
  somewhere wrong — `10.2` in the test-mode files resolved for months against a
  requirement about response data integrity. Only reading the requirement
  catches that, which is why this section leads with a rule for people.
- **When a requirement stops describing what was built, correct it and say
  what it replaced.** Requirement 18.4 claimed the audit log lived on the
  settings page long after it had a route of its own. A silent rewrite loses
  the fact that the design changed.
- **Tick a task only when its behaviour exists and a test covers it.** The
  2026-08-23 closure audit found tasks marked complete before the behaviour
  existed and cost days of re-verification. An unticked box that is done is a
  small lie; a ticked box that is not is an expensive one.

# Commit Discipline

- **One green behaviour per commit**: Each commit should deliver one testable vertical slice, including its failing test, minimal production change, and passing validation. Do not bundle an entire top-level task or unrelated fixes.
- **Commit before moving on**: Once a slice is green, update AI_CONTEXT.md and README.md when required, commit it, and only then start the next slice. Do not accumulate completed behaviours in the working tree.
- **Size is a warning, not a quota**: Prefer a small handful of focused files and usually fewer than 200–300 changed lines. Split further when a reviewer cannot explain the change as one behaviour; do not split tightly coupled test and production code merely to meet a number.
- **Green checkpoints only**: Preserve Red → Green → Refactor during development, but commit after the relevant tests and checks pass. Every commit must be independently reviewable and leave the branch in a valid state.
- **Explicit consolidation exceptions**: If prior work has already crossed several boundaries, label the recovery commit as a one-off consolidation checkpoint, validate it fully, and restore one-behaviour cadence immediately afterward.

# Architecture Rules

- **TDD mandatory**: Write a failing test BEFORE writing production code. Red → Green → Refactor.
- **Repository pattern**: Services depend on repository interfaces, never import Prisma directly. Use in-memory fakes for unit tests.
- **Thin route handlers**: Route files validate input (Zod), call a service, format the response. No business logic in routes.
- **Factory injection**: Services are created via factory functions that accept repository dependencies. No DI container.
- **Typed errors**: Never throw raw strings. All errors extend `AppError` with `code` and `statusCode`.
- **No `any`**: Use `unknown` with type guards. Strict TypeScript throughout.
- **File size**: Prefer <200 lines. Extract at 300.
- **Vertical slices**: Each task implements one testable behaviour, not an entire service.

# Testing Rules

A passing test is not evidence. These rules exist because tests in this
repository have been green while the behaviour they named was broken.

- **Assert the observable outcome, not the call you just made.** Verifying that a
  collaborator was invoked proves your wiring, not the result. Three real
  examples from this project, all green at the time:
  - the notification sink was asserted to be *called* with `'closing_reminder'`,
    so a reminder that rendered identically to an opening prompt passed
    (Requirement 13.4 was unimplemented)
  - `prisma.test.ts` asserted a `PrismaClient` was *constructed*, so a Turso
    adapter built from the wrong argument passed six tests while every
    production query would have failed with `URL_INVALID`
  - the MSW handler *required* a body `memberId` the real route ignores, so the
    mock enforced a contract no server implemented
- **Construction is not execution.** Building a client, adapter, or service
  usually succeeds regardless of configuration. If a code path talks to a
  database, a browser, or an API, some test must actually run a query, a render,
  or a request through it.
- **Mocks mirror the real contract.** A mock is a claim about how the system
  behaves. When it drifts from the route it imitates, passing UI tests mean
  nothing. Update the mock in the same commit as the contract.
- **Cross-check computed values against an independent source.** "The page shows
  3.5" proves rendering, not correctness. For aggregates, averages, counts, and
  distributions, read the value back from the database directly.
- **Never skip a required scenario.** A test that calls `skip` when its fixture
  is unavailable reports success for work it did not do. Missing setup must fail.
- **Flaky tests are defects.** A nondeterministic test destroys the signal the
  rest of the suite provides. Fix it or delete it; do not re-run until green.
- **Choose the tier by what only it can catch**, not by habit. Unit tests for
  business rules; property tests for invariants; integration tests over a real
  SQLite file for adapter and query behaviour; browser tests for hydration,
  cookies, and navigation. Hydration failures and unfurl metadata are invisible
  below the top tier.
- **Run the real thing before claiming it works.** Start the app, click the
  button, read the message that arrived. Every significant defect found in this
  project was found by execution, never by adding assertions to a green suite.

# Code Quality

- ESLint errors fail CI. No warnings allowed to accumulate.
- `npx tsc --noEmit` must pass before push.
- Property-based tests (fast-check) validate correctness properties from the design doc.
- Conventional commits: `feat:` `fix:` `test:` `docs:` `chore:`
