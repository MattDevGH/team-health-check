# Team Health Check

> A lightweight feedback tool for delivery teams, inspired by the Spotify Squad Health Check Model.

Collects regular health-check responses from team members via a mobile-friendly web interface and Slack bot, then visualises trends over time to help delivery managers identify patterns and improvements.

## Stack

- **Next.js 15** — React framework with App Router and API routes
- **TypeScript** — strict mode, no `any` types
- **Prisma 7** — ORM with SQLite via `better-sqlite3` (driver adapter pattern)
- **Tailwind CSS v4** — utility-first styling
- **Zod** — runtime input validation
- **SQLite** — single-file database, no server required

## Getting Started

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

```
Route Handler → Service → Repository → Prisma → SQLite
```

- **Repository pattern** for testability — services depend on interfaces, not Prisma directly
- **Factory injection** — services created via factory functions accepting dependencies
- **Thin route handlers** — validate input (Zod), call service, format response
- **Typed errors** — all errors extend `AppError`, mapped to HTTP status codes automatically

## Testing

TDD approach using Vitest, React Testing Library, msw, jest-axe, fast-check, and Playwright.

```bash
npm test            # unit + property tests (CI)
npm run test:watch  # watch mode for TDD (unit only)
npx playwright test # e2e browser tests
```

| Layer | Purpose |
|-------|---------|
| Unit tests | Service logic with in-memory repository fakes |
| Property tests | Formal correctness invariants (fast-check) |
| Integration tests | Full flows against real SQLite |
| Accessibility tests | WCAG 2.1 AA compliance (jest-axe) |
| E2E tests | Browser user flows (Playwright) |

## CI/CD

GitHub Actions pipeline: Install → Lint → Type Check → Tests → Build → E2E

All stages must pass before merge to master.

## Working with AI assistants

- **`AGENTS.md`** — rules and architecture constraints for AI agents
- **`AI_CONTEXT.md`** — current project state. Read at session start, update with every commit.

## Spec

Full feature specification at `.kiro/specs/team-health-check/`:
- Requirements (20 functional + 4 non-functional)
- Technical design (architecture, data models, 34 correctness properties)
- Task list (pending generation)
