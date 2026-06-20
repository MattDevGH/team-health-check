# AI Session Context

> Read this at the start of every session to resume without re-discovery.
>
> **Mandatory update rule:** Update both AI_CONTEXT.md and README.md as part of
> any commit that changes project structure, behaviour, test coverage, or conventions.

---

## Project

[Replace with: app name, purpose, developer name]

**Repo:** [Replace with GitHub URL]
**Branch:** master (single branch, push directly)

---

## Stack

| Layer     | Choice                        | Notes |
|-----------|-------------------------------|-------|
| Framework | Next.js 16 (App Router)       | Read node_modules/next/dist/docs/ before writing Next-specific code |
| Language  | TypeScript (strict)           | No JS files in src/ |
| ORM       | Prisma 7 + better-sqlite3     | Driver adapter pattern. Config in prisma.config.ts |
| DB        | SQLite (prisma/dev.db)        | Gitignored. Run: npx prisma migrate dev --name init |
| Styling   | Tailwind CSS v4               | PostCSS plugin (@tailwindcss/postcss) |
| Testing   | Vitest + RTL + msw + jest-axe | See Testing section |
| CI        | GitHub Actions                | .github/workflows/ci.yml |

---

## File Structure

```
src/
  app/
    api/items/
      route.ts          # GET + POST placeholder - replace with your domain
      [id]/route.ts     # PATCH + DELETE placeholder - replace with your domain
    page.tsx            # Minimal placeholder UI - replace with your domain
    layout.tsx
    globals.css
  lib/
    prisma.ts           # Singleton PrismaClient - do not add tests
  tests/
    setup.ts            # msw server lifecycle
    mocks/
      handlers.ts       # msw handlers - update as you build routes
      server.ts         # msw setupServer
    api/
      items.test.ts     # Placeholder - replace with domain tests
    ui/
      page.test.tsx     # Placeholder - replace with domain tests
      accessibility.test.tsx  # axe-core tests - keep and extend
prisma/
  schema.prisma         # Placeholder Item model - replace with your domain model
prisma.config.ts        # Prisma 7 datasource config - no changes needed
.github/workflows/
  ci.yml                # Runs npm test on push/PR to master
```

---

## Prisma Schema

Currently a placeholder Item model. Replace with your domain model then run:
  npx prisma migrate dev --name <migration-name>

---

## Test Coverage

Smoke tests only — replace as you build.
- api/items.test.ts: todo placeholders
- ui/page.test.tsx: renders without crashing
- ui/accessibility.test.tsx: full page axe scan

npm test — single run (CI)
npm run test:watch — watch mode (TDD)

---

## Key Decisions & Reasoning

Inherited from nextjs-fullstack-starter.

- prisma.ts singleton untested — infrastructure glue, not worth unit testing
- No Storybook — deferred, worth revisiting if component library grows
- Commit style — conventional commits: feat: fix: test: docs: chore:
- Email privacy — configure git user.email to your GitHub no-reply address

---

## Outstanding Work

[Replace with your own task list as the project evolves]
