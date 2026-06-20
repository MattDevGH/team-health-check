# [Your App Name]

> **Generated from [nextjs-fullstack-starter](https://github.com/MattDevGH/nextjs-fullstack-starter).**

A brief description of what this app does.

## Stack

- **Next.js 16** — React framework with App Router and API routes
- **TypeScript** — type safety throughout
- **Prisma 7** — ORM with SQLite via `better-sqlite3`
- **Tailwind CSS** — utility-first styling
- **SQLite** — single-file database, no server required

## Getting Started

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

TDD approach using Vitest, React Testing Library, msw, and jest-axe.

```bash
npm test            # single run (CI)
npm run test:watch  # watch mode for TDD
```

## Working with AI assistants

- **`AGENTS.md`** — rules and instructions for AI agents
- **`AI_CONTEXT.md`** — current project state. Read at session start, update with every commit.

## API

| Method | Endpoint       | Description    |
|--------|----------------|----------------|
| GET    | /api/items     | List all items |
| POST   | /api/items     | Create an item |
| PATCH  | /api/items/:id | Update an item |
| DELETE | /api/items/:id | Delete an item |
