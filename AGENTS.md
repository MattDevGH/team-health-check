<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in node_modules/next/dist/docs/ before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Session Context

Read AI_CONTEXT.md at the start of every session.

**After every commit:** update both AI_CONTEXT.md and README.md to reflect any changes to project structure, behaviour, test coverage, or conventions. Do not leave these files out of sync with the codebase.

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

# Code Quality

- ESLint errors fail CI. No warnings allowed to accumulate.
- `npx tsc --noEmit` must pass before push.
- Property-based tests (fast-check) validate correctness properties from the design doc.
- Conventional commits: `feat:` `fix:` `test:` `docs:` `chore:`
